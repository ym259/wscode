import JSZip from 'jszip';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';

/**
 * Tiptap JSON content type
 */
interface JSONContent {
    type: string;
    attrs?: Record<string, unknown>;
    content?: JSONContent[];
    text?: string;
    marks?: Array<{
        type: string;
        attrs?: Record<string, unknown>;
    }>;
}

interface DocAttrs {
    sectPrElements?: unknown[];
    pageSize?: Record<string, string>;
    pageMargins?: Record<string, string>;
    docGrid?: Record<string, string>;
    cols?: Record<string, string>;
    styleId?: string;
    docDefaults?: Record<string, unknown>; // Complex nested structure from XML parser
    keepNext?: string | number;
    keepLines?: string | number;
    snapToGrid?: string;
    contextualSpacing?: string;
    lineHeight?: string;
    lineRule?: string;
    spacingBefore?: string;
    spacingAfter?: string;
    textAlign?: string;
    indent?: string;
    hanging?: string;
    firstLine?: string;
    pPrFontSize?: string;
    pPrFontFamily?: string;
    originalNumId?: string;
    start?: number;
    level?: number;
    backgroundColor?: string;
    color?: string;
    fontSize?: string;
    fontFamily?: string;
    author?: string;
    date?: string;
    commentId?: string;
    content?: string;
}

/**
 * Comment data extracted from content
 */
interface CommentData {
    sourceId: string;
    docxId: string; // MUST be numeric string for Word compatibility
    author: string;
    date: string;
    content: string;
}

/**
 * DocxWriter - Serializes Tiptap JSON content to DOCX format
 * 
 * This class converts Tiptap editor content back to valid DOCX XML,
 * preserving formatting, track changes, and comments.
 */
export class DocxWriter {
    private originalZip: JSZip | null = null;
    private comments: CommentData[] = [];
    private commentIdMap = new Map<string, string>();
    private nextCommentId = 0;
    private insertionIdCounter = 0;
    private deletionIdCounter = 0;
    private listNumIdBullet = 1;
    private listNumIdOrdered = 2;
    // Track unique numId for each top-level list (for numbering reset)
    private nextNumId = 10; // Start at 10 to leave room for base definitions
    private usedNumIds: number[] = [];
    private numIdStarts: Record<number, number> = {};

    constructor(originalZip?: JSZip) {
        this.originalZip = originalZip || null;
    }

    /**
     * Export Tiptap JSON content to DOCX blob
     */
    async export(content: JSONContent): Promise<Blob> {
        // Reset state
        this.comments = [];
        this.commentIdMap.clear();
        this.nextCommentId = 0;
        this.insertionIdCounter = 0;
        this.deletionIdCounter = 0;
        this.nextNumId = 10;
        this.usedNumIds = [];

        // Create or use existing ZIP
        const zip = this.originalZip ? this.originalZip : new JSZip();

        // Serialize document content
        const documentXml = this.serializeDocument(content.content || [], content.attrs);

        // Add required files
        // Add required files
        if (!this.originalZip) {
            zip.file('[Content_Types].xml', this.getContentTypesXml());
            zip.file('_rels/.rels', this.getRelsXml());
            zip.file('word/_rels/document.xml.rels', this.getDocumentRelsXml());
            zip.file('word/styles.xml', this.getStylesXml(content.attrs));
        } else {
            // Check if styles.xml exists, if not write it (rare but possible in simple XML docs)
            if (!zip.file('word/styles.xml')) {
                zip.file('word/styles.xml', this.getStylesXml(content.attrs));
            }
        }

        zip.file('word/document.xml', documentXml);

        // Add numbering.xml for list formatting
        // If we have the original ZIP, try to preserve the original numbering.xml for better fidelity
        let useOriginalNumbering = false;
        if (this.originalZip) {
            const originalNumberingXml = await this.originalZip.file('word/numbering.xml')?.async('string');
            if (originalNumberingXml) {
                // Append any NEW generated numbering definitions to the original file
                // This handles lists that were forked (e.g. for numbering restart) which need new definitions
                const closingTag = '</w:numbering>';
                if (originalNumberingXml.includes(closingTag)) {
                    const newDefinitions = this.getNumberingXml(true);
                    const mergedXml = originalNumberingXml.replace(closingTag, '') + newDefinitions + closingTag;
                    zip.file('word/numbering.xml', mergedXml);
                } else {
                    zip.file('word/numbering.xml', originalNumberingXml);
                }
                useOriginalNumbering = true;
            }
        }
        if (!useOriginalNumbering) {
            zip.file('word/numbering.xml', this.getNumberingXml());
        }

        // Add comments if any
        if (this.comments.length > 0) {
            zip.file('word/comments.xml', this.serializeComments());
        }

        if (this.originalZip) {
            // Update [Content_Types].xml if needed
            await this.updateContentTypesXml(zip);

            // Update word/_rels/document.xml.rels if needed
            await this.updateDocumentRelsXml(zip);
        }

        // Generate blob
        return zip.generateAsync({
            type: 'blob',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            compression: 'DEFLATE'
        });
    }

    /**
     * XML escape special characters
     */
    private escapeXml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    /**
     * Convert hex color to DOCX format (remove # prefix)
     */
    private colorToDocx(color: string): string {
        return color.replace('#', '').toUpperCase();
    }

    /**
     * Convert pt font size to half-points (DOCX format)
     */
    private fontSizeToHalfPoints(fontSize: string): number {
        const ptMatch = fontSize.match(/(\d+(?:\.\d+)?)/);
        if (ptMatch) {
            return Math.round(parseFloat(ptMatch[1]) * 2);
        }
        return 22; // Default 11pt
    }

    /**
     * Map highlight color to DOCX highlight value
     */
    private highlightColorToDocx(color: string): string {
        const colorMap: Record<string, string> = {
            '#ffff00': 'yellow',
            '#00ff00': 'green',
            '#00ffff': 'cyan',
            '#ff00ff': 'magenta',
            '#0000ff': 'blue',
            '#ff0000': 'red',
            '#000080': 'darkBlue',
            '#008080': 'darkCyan',
            '#008000': 'darkGreen',
            '#800080': 'darkMagenta',
            '#800000': 'darkRed',
            '#808000': 'darkYellow',
            '#808080': 'darkGray',
            '#c0c0c0': 'lightGray',
            '#000000': 'black',
        };
        return colorMap[color.toLowerCase()] || 'yellow';
    }

    /**
     * Serialize full document
     */
    private serializeDocument(content: JSONContent[], docAttrs?: DocAttrs): string {
        const bodyContent = content.map(node => this.serializeNode(node, 0)).join('');

        let sectPr = '';
        // If we have captured section properties, use them for fidelity (headers, footers, etc.)
        if (docAttrs && docAttrs.sectPrElements) {
            const builder = new XMLBuilder({
                ignoreAttributes: false,
                attributeNamePrefix: '',
                preserveOrder: true,
                suppressEmptyNode: true,
            });
            sectPr = `<w:sectPr>${builder.build(docAttrs.sectPrElements)}</w:sectPr>`;
        } else if (docAttrs && (docAttrs.pageSize || docAttrs.pageMargins || docAttrs.docGrid)) {
            sectPr += '<w:sectPr>';

            // Page Size
            if (docAttrs.pageSize) {
                const w = docAttrs.pageSize['w:w'] || docAttrs.pageSize['w'] || '11906';
                const h = docAttrs.pageSize['w:h'] || docAttrs.pageSize['h'] || '16838';
                sectPr += `<w:pgSz w:w="${w}" w:h="${h}"/>`;
            }

            // Page Margins
            if (docAttrs.pageMargins) {
                const top = docAttrs.pageMargins['w:top'] || '1985';
                const right = docAttrs.pageMargins['w:right'] || '1701';
                const bottom = docAttrs.pageMargins['w:bottom'] || '1701';
                const left = docAttrs.pageMargins['w:left'] || '1701';
                const header = docAttrs.pageMargins['w:header'] || '708';
                const footer = docAttrs.pageMargins['w:footer'] || '708';
                const gutter = docAttrs.pageMargins['w:gutter'] || '0';
                sectPr += `<w:pgMar w:top="${top}" w:right="${right}" w:bottom="${bottom}" w:left="${left}" w:header="${header}" w:footer="${footer}" w:gutter="${gutter}"/>`;
            }

            // Columns - Keep only if present in original
            if (docAttrs.cols) {
                const space = docAttrs.cols['w:space'] || '720';
                sectPr += `<w:cols w:space="${space}"/>`;
            }

            // Document Grid - Keep only if present in original
            if (docAttrs.docGrid) {
                const linePitch = docAttrs.docGrid['w:linePitch'] || '360';
                const type = docAttrs.docGrid['w:type'] || 'lines';
                sectPr += `<w:docGrid w:linePitch="${linePitch}" w:type="${type}"/>`;
            }

            sectPr += '</w:sectPr>';
        } else {
            // Minimal A4 if no attributes captured
            sectPr = `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`;
        }

        return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>
${bodyContent}
${sectPr}
</w:body>
</w:document>`;
    }

    /**
     * Serialize any node type
     */
    private serializeNode(node: JSONContent, listLevel: number = 0): string {
        switch (node.type) {
            case 'paragraph':
                return this.serializeParagraph(node);
            case 'heading':
                return this.serializeHeading(node);
            case 'bulletList':
                return this.serializeList(node, false, listLevel);
            case 'orderedList':
                return this.serializeList(node, true, listLevel);
            case 'listItem':
                return this.serializeListItem(node, listLevel);
            case 'table':
                return this.serializeTable(node);
            case 'tableRow':
                return this.serializeTableRow(node);
            case 'tableCell':
            case 'tableHeader':
                return this.serializeTableCell(node);
            case 'hardBreak':
                return '<w:r><w:br/></w:r>';
            case 'text':
                return this.serializeTextRun(node);
            default:
                // Handle unknown nodes by serializing children
                if (node.content) {
                    return node.content.map(child => this.serializeNode(child, listLevel)).join('');
                }
                return '';
        }
    }

    /**
     * Serialize paragraph
     */
    private serializeParagraph(node: JSONContent, listInfo?: { numId: number; ilvl: number }): string {
        let pPr = '';

        const attrs = node.attrs as DocAttrs | undefined;

        // Add paragraph style if present (for heading-style paragraphs)
        if (attrs?.styleId) {
            pPr += `<w:pStyle w:val="${attrs.styleId}"/>`;
        }

        // Add list properties if this is a list item
        if (listInfo) {
            pPr += `<w:numPr><w:ilvl w:val="${listInfo.ilvl}"/><w:numId w:val="${listInfo.numId}"/></w:numPr>`;
        }

        // Keep with next / keep lines together (overrides style outline behavior)
        // Only output if explicitly set in the original document (not null or undefined)
        if (attrs?.keepNext != null) {
            pPr += `<w:keepNext w:val="${attrs.keepNext}"/>`;
        }
        if (attrs?.keepLines != null) {
            pPr += `<w:keepLines w:val="${attrs.keepLines}"/>`;
        }

        // Add spacing (lineHeight, spacingBefore, spacingAfter)
        // lineHeight from DocxReader is already in twips (raw value from w:spacing w:line)
        if (attrs?.snapToGrid) {
            pPr += `<w:snapToGrid w:val="${attrs.snapToGrid}"/>`;
        }
        if (attrs?.contextualSpacing) {
            pPr += `<w:contextualSpacing w:val="${attrs.contextualSpacing}"/>`;
        }

        if (attrs?.lineHeight || attrs?.spacingBefore || attrs?.spacingAfter) {
            let spacingAttrs = '';
            if (attrs?.spacingBefore) {
                spacingAttrs += ` w:before="${attrs.spacingBefore}"`;
            }
            if (attrs?.spacingAfter) {
                spacingAttrs += ` w:after="${attrs.spacingAfter}"`;
            }
            if (attrs?.lineHeight) {
                const rule = attrs.lineRule || 'auto';
                spacingAttrs += ` w:line="${attrs.lineHeight}" w:lineRule="${rule}"`;
            }
            pPr += `<w:spacing${spacingAttrs}/>`;
        }

        // Add text alignment
        if (attrs?.textAlign) {
            const alignMap: Record<string, string> = {
                'left': 'left',
                'center': 'center',
                'right': 'right',
                'justify': 'both'
            };
            pPr += `<w:jc w:val="${alignMap[attrs.textAlign] || 'left'}"/>`;
        }

        // Add indentation
        if (attrs?.indent || attrs?.hanging || attrs?.firstLine) {
            let pPrIndent = '';

            if (attrs?.indent) {
                const val = parseInt(attrs.indent as string);
                // Heuristic: values > 20 are likely already twips (from Reader), 
                // values <= 20 are likely levels (from Editor).
                // 20 levels = 10 inches, unlikely to be exceeded by normal levels.
                const indentTwips = val > 20 ? val : val * 720;
                pPrIndent += ` w:left="${indentTwips}"`;
            }

            if (attrs?.hanging) {
                pPrIndent += ` w:hanging="${attrs.hanging}"`;
            }

            if (attrs?.firstLine) {
                pPrIndent += ` w:firstLine="${attrs.firstLine}"`;
            }

            if (pPrIndent) {
                pPr += `<w:ind${pPrIndent}/>`;
            }
        }

        if (attrs?.contextualSpacing) {
            pPr += `<w:contextualSpacing w:val="${attrs.contextualSpacing}"/>`;
        }

        // Add paragraph default run properties (w:rPr inside w:pPr)
        if (attrs?.pPrFontSize || attrs?.pPrFontFamily) {
            let rPr = '';
            if (attrs?.pPrFontFamily) {
                const font = this.escapeXml(attrs.pPrFontFamily as string);
                rPr += `<w:rFonts w:ascii="${font}" w:eastAsia="${font}" w:hAnsi="${font}" w:cs="${font}"/>`;
            }
            if (attrs?.pPrFontSize) {
                // Convert from pt to half-points
                const ptVal = parseFloat((attrs.pPrFontSize as string).replace('pt', ''));
                const halfPts = Math.round(ptVal * 2);
                rPr += `<w:sz w:val="${halfPts}"/>`;
                rPr += `<w:szCs w:val="${halfPts}"/>`;
            }
            if (rPr) {
                pPr += `<w:rPr>${rPr}</w:rPr>`;
            }
        }

        const pPrXml = pPr ? `<w:pPr>${pPr}</w:pPr>` : '';
        const content = this.serializeParagraphContent(node.content || []);

        return `<w:p>${pPrXml}${content}</w:p>`;
    }

    /**
     * Serialize paragraph content (text runs with marks)
     */
    private serializeParagraphContent(content: JSONContent[]): string {
        let result = '';

        // Track active comment across inline nodes so we emit one contiguous range per comment.
        let activeCommentSourceId: string | null = null;
        let activeCommentDocxId: string | null = null;

        const closeActiveComment = () => {
            if (!activeCommentDocxId) return;
            result += `<w:commentRangeEnd w:id="${activeCommentDocxId}"/>`;
            result += `<w:r><w:commentReference w:id="${activeCommentDocxId}"/></w:r>`;
            activeCommentSourceId = null;
            activeCommentDocxId = null;
        };

        const getCommentInfoFromInlineNode = (node: JSONContent): { sourceId: string; author: string; date: string; content: string } | null => {
            const marks = node.marks || [];
            const commentMark = marks.find(m => m.type === 'comment');
            if (!commentMark) return null;
            const attrs = (commentMark.attrs || {}) as Record<string, unknown>;
            const sourceId = String(attrs.commentId || `__comment_${this.comments.length}`);
            const author = String(attrs.author || 'Unknown');
            const date = String(attrs.date || new Date().toISOString());
            const content = String(attrs.content || '');
            return { sourceId, author, date, content };
        };

        for (const child of content) {
            // Comments in our editor model are marks on inline text nodes.
            const commentInfo = getCommentInfoFromInlineNode(child);
            const nextSourceId = commentInfo?.sourceId ?? null;

            // If comment boundary changes, close/open ranges as needed
            if (nextSourceId !== activeCommentSourceId) {
                closeActiveComment();
                if (commentInfo) {
                    const docxId = this.getDocxCommentId(commentInfo.sourceId);

                    // Ensure comment is present in comments.xml
                    if (!this.comments.find(c => c.sourceId === commentInfo.sourceId)) {
                        this.comments.push({
                            sourceId: commentInfo.sourceId,
                            docxId,
                            author: commentInfo.author,
                            date: commentInfo.date,
                            content: commentInfo.content
                        });
                    }

                    result += `<w:commentRangeStart w:id="${docxId}"/>`;
                    activeCommentSourceId = commentInfo.sourceId;
                    activeCommentDocxId = docxId;
                }
            }

            // Serialize the child node itself (without emitting comment range wrappers)
            if (child.type === 'text') {
                result += this.serializeTextRun(child);
            } else {
                result += this.serializeNode(child);
            }
        }

        // Close any remaining open comment range at end of paragraph
        closeActiveComment();

        return result;
    }

    /**
     * Serialize heading
     */
    private serializeHeading(node: JSONContent): string {
        const attrs = node.attrs as DocAttrs | undefined;
        const level = attrs?.level || 1;
        const content = this.serializeParagraphContent(node.content || []);

        // Use original style ID if available, otherwise generate from level
        const styleId = attrs?.styleId || `Heading${level}`;
        let pPr = `<w:pStyle w:val="${styleId}"/>`;

        if (attrs?.snapToGrid) {
            pPr += `<w:snapToGrid w:val="${attrs.snapToGrid}"/>`;
        }

        // Keep with next / keep lines together (overrides style outline behavior)
        // Only output if explicitly set in the original document (not null or undefined)
        if (attrs?.keepNext != null) {
            pPr += `<w:keepNext w:val="${attrs.keepNext}"/>`;
        }
        if (attrs?.keepLines != null) {
            pPr += `<w:keepLines w:val="${attrs.keepLines}"/>`;
        }

        // Add spacing (lineHeight, spacingBefore, spacingAfter)
        if (attrs?.lineHeight || attrs?.spacingBefore || attrs?.spacingAfter) {
            let spacingAttrs = '';
            if (attrs?.spacingBefore) {
                spacingAttrs += ` w:before="${attrs.spacingBefore}"`;
            }
            if (attrs?.spacingAfter) {
                spacingAttrs += ` w:after="${attrs.spacingAfter}"`;
            }
            if (attrs?.lineHeight) {
                const rule = attrs.lineRule || 'auto';
                spacingAttrs += ` w:line="${attrs.lineHeight}" w:lineRule="${rule}"`;
            }
            pPr += `<w:spacing${spacingAttrs}/>`;
        }

        // Add text alignment
        if (attrs?.textAlign) {
            const alignMap: Record<string, string> = {
                'left': 'left',
                'center': 'center',
                'right': 'right',
                'justify': 'both'
            };
            pPr += `<w:jc w:val="${alignMap[attrs.textAlign] || 'left'}"/>`;
        }

        if (attrs?.contextualSpacing) {
            pPr += `<w:contextualSpacing w:val="${attrs.contextualSpacing}"/>`;
        }

        return `<w:p><w:pPr>${pPr}</w:pPr>${content}</w:p>`;
    }

    /**
     * Serialize text run with marks
     */
    private serializeTextRun(node: JSONContent): string {
        if (!node.text) return '';

        const text = this.escapeXml(node.text);
        const marks = node.marks || [];

        // Check for track change marks
        const insertionMark = marks.find(m => m.type === 'insertion');
        const deletionMark = marks.find(m => m.type === 'deletion');
        // Note: comment ranges are handled at paragraph-content level (serializeParagraphContent)
        // to avoid emitting invalid multiple range markers for the same comment.

        // Build run properties
        let rPr = '';
        for (const mark of marks) {
            switch (mark.type) {
                case 'bold':
                    rPr += '<w:b/>';
                    break;
                case 'italic':
                    rPr += '<w:i/>';
                    break;
                case 'underline':
                    rPr += '<w:u w:val="single"/>';
                    break;
                case 'strike':
                    rPr += '<w:strike/>';
                    break;
                case 'textStyle':
                    if (mark.attrs?.color) {
                        rPr += `<w:color w:val="${this.colorToDocx(mark.attrs.color as string)}"/>`;
                    }
                    if (mark.attrs?.fontSize) {
                        const halfPts = this.fontSizeToHalfPoints(mark.attrs.fontSize as string);
                        rPr += `<w:sz w:val="${halfPts}"/>`;
                    }
                    if (mark.attrs?.fontFamily) {
                        const font = this.escapeXml(mark.attrs.fontFamily as string);
                        rPr += `<w:rFonts w:ascii="${font}" w:eastAsia="${font}" w:hAnsi="${font}" w:cs="${font}"/>`;
                    }
                    break;
                case 'highlight':
                    if (mark.attrs?.color) {
                        rPr += `<w:highlight w:val="${this.highlightColorToDocx(mark.attrs.color as string)}"/>`;
                    }
                    break;
            }
        }

        const rPrXml = rPr ? `<w:rPr>${rPr}</w:rPr>` : '';
        let runXml: string;

        // Handle deletion (uses delText instead of t)
        if (deletionMark) {
            runXml = `<w:r>${rPrXml}<w:delText>${text}</w:delText></w:r>`;
        } else {
            runXml = `<w:r>${rPrXml}<w:t>${text}</w:t></w:r>`;
        }

        // Wrap in track change elements
        if (insertionMark) {
            const attrs = insertionMark.attrs as DocAttrs | undefined;
            const id = this.insertionIdCounter++;
            const author = attrs?.author || 'Unknown';
            const date = attrs?.date || new Date().toISOString();
            runXml = `<w:ins w:id="${id}" w:author="${this.escapeXml(author)}" w:date="${date}">${runXml}</w:ins>`;
        }

        if (deletionMark) {
            const attrs = deletionMark.attrs as DocAttrs | undefined;
            const id = this.deletionIdCounter++;
            const author = attrs?.author || 'Unknown';
            const date = attrs?.date || new Date().toISOString();
            runXml = `<w:del w:id="${id}" w:author="${this.escapeXml(author)}" w:date="${date}">${runXml}</w:del>`;
        }

        return runXml;
    }

    /**
     * Serialize list (bullet or ordered)
     * For top-level lists (level=0), use unique numId to reset numbering
     */
    private serializeList(node: JSONContent, isOrdered: boolean, level: number): string {
        const items = node.content || [];
        const attrs = node.attrs as DocAttrs | undefined;
        const effectiveLevel = attrs?.level !== undefined ? (attrs.level as number) : level;

        // Use original numId if available (for round-trip fidelity)
        let numId: number;

        // Check for specific start value (e.g. continuing a list after interruption)
        if (isOrdered && attrs?.start && (attrs.start as number) > 1) {
            numId = this.nextNumId++;
            this.numIdStarts[numId] = attrs.start as number;
            this.usedNumIds.push(numId);
        } else if (attrs?.originalNumId) {
            numId = parseInt(attrs.originalNumId as string);
            if (!this.usedNumIds.includes(numId)) {
                this.usedNumIds.push(numId);
            }
        } else if (isOrdered && level === 0) {
            // For new lists, use unique numId to reset numbering
            numId = this.nextNumId++;
            this.usedNumIds.push(numId);
        } else {
            numId = isOrdered ? this.listNumIdOrdered : this.listNumIdBullet;
        }

        return items.map(item => {
            if (item.type === 'listItem') {
                return this.serializeListItemWithLevel(item, numId, effectiveLevel);
            }
            return '';
        }).join('');
    }

    /**
     * Serialize list item with specific level
     */
    private serializeListItemWithLevel(node: JSONContent, numId: number, level: number): string {
        const content = node.content || [];
        let result = '';

        for (const child of content) {
            if (child.type === 'paragraph') {
                result += this.serializeParagraph(child, { numId, ilvl: level });
            } else if (child.type === 'bulletList') {
                result += this.serializeList(child, false, level + 1);
            } else if (child.type === 'orderedList') {
                result += this.serializeList(child, true, level + 1);
            } else {
                result += this.serializeNode(child, level);
            }
        }

        return result;
    }

    /**
     * Serialize list item (legacy)
     */
    private serializeListItem(node: JSONContent, level: number): string {
        return this.serializeListItemWithLevel(node, this.listNumIdOrdered, level);
    }

    /**
     * Serialize table
     */
    private serializeTable(node: JSONContent): string {
        const rows = (node.content || []).map(row => this.serializeTableRow(row)).join('');
        return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr>${rows}</w:tbl>`;
    }

    /**
     * Serialize table row
     */
    private serializeTableRow(node: JSONContent): string {
        const cells = (node.content || []).map(cell => this.serializeTableCell(cell)).join('');
        return `<w:tr>${cells}</w:tr>`;
    }

    /**
     * Serialize table cell
     */
    private serializeTableCell(node: JSONContent): string {
        const content = (node.content || []).map(child => this.serializeNode(child)).join('');
        return `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>${content}</w:tc>`;
    }

    /**
     * Serialize comments to comments.xml
     */
    private serializeComments(): string {
        const commentsXml = this.comments.map(comment => {
            return `<w:comment w:id="${comment.docxId}" w:author="${this.escapeXml(comment.author)}" w:date="${this.escapeXml(comment.date)}">
<w:p><w:r><w:t>${this.escapeXml(comment.content)}</w:t></w:r></w:p>
</w:comment>`;
        }).join('\n');

        return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
${commentsXml}
</w:comments>`;
    }

    /**
     * Map internal comment IDs to numeric DOCX ids (Word requires w:id to be an integer).
     * If the source id is already numeric, it is used directly.
     */
    private getDocxCommentId(sourceId: string): string {
        const s = String(sourceId ?? '');

        const existing = this.commentIdMap.get(s);
        if (existing) return existing;

        const next = String(this.nextCommentId++);
        this.commentIdMap.set(s, next);
        return next;
    }

    /**
     * Get [Content_Types].xml
     */
    private getContentTypesXml(): string {
        return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
${this.comments.length > 0 ? '<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>' : ''}
</Types>`;
    }

    /**
     * Get _rels/.rels
     */
    private getRelsXml(): string {
        return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
    }

    /**
     * Get word/_rels/document.xml.rels
     */
    private getDocumentRelsXml(): string {
        let rId = 1;
        let relationships = '';

        // Styles relationship
        relationships += `<Relationship Id="rId${rId++}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;

        // Numbering relationship
        relationships += `<Relationship Id="rId${rId++}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>`;

        // Comments relationship if needed
        if (this.comments.length > 0) {
            relationships += `<Relationship Id="rId${rId++}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>`;
        }

        return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${relationships}
</Relationships>`;
    }

    /**
     * Get word/styles.xml - defines heading and paragraph styles
     */
    private getStylesXml(docAttrs?: DocAttrs): string {
        let docDefaults = '';
        if (docAttrs?.docDefaults) {
            const d = docAttrs.docDefaults;
            let rPrInner = '';

            // Fonts
            if (d.rFonts) {
                const rFonts = d.rFonts as Record<string, Record<string, string>>;
                const attrs = (rFonts[':@'] || d.rFonts) as Record<string, string>;
                let fontAttrs = '';
                Object.keys(attrs).forEach(k => {
                    fontAttrs += ` ${k}="${attrs[k]}"`;
                });
                rPrInner += `<w:rFonts${fontAttrs}/>`;
            }

            // Size
            if (d.sz) {
                const sz = d.sz as Record<string, Record<string, string>>;
                const attrs = (sz[':@'] || d.sz) as Record<string, string>;
                const val = attrs['w:val'] || attrs['val'];
                if (val) rPrInner += `<w:sz w:val="${val}"/>`;
            }
            if (d.szCs) {
                const szCs = d.szCs as Record<string, Record<string, string>>;
                const attrs = (szCs[':@'] || d.szCs) as Record<string, string>;
                const val = attrs['w:val'] || attrs['val'];
                if (val) rPrInner += `<w:szCs w:val="${val}"/>`;
            }

            if (d.lang) {
                const lang = d.lang as Record<string, Record<string, string>>;
                const attrs = (lang[':@'] || d.lang) as Record<string, string>;
                let langAttrs = '';
                Object.keys(attrs).forEach(k => {
                    langAttrs += ` ${k}="${attrs[k]}"`;
                });
                rPrInner += `<w:lang${langAttrs}/>`;
            }

            let pPrInner = '';
            if (d.pPr) {
                const pPr = d.pPr as Record<string, string>;
                if (pPr.widowControl) {
                    pPrInner += `<w:widowControl w:val="${pPr.widowControl}"/>`;
                }
            }

            if (rPrInner) {
                docDefaults += `<w:rPrDefault><w:rPr>${rPrInner}</w:rPr></w:rPrDefault>`;
            }
            if (pPrInner) {
                docDefaults += `<w:pPrDefault><w:pPr>${pPrInner}</w:pPr></w:pPrDefault>`;
            }
        }

        return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" mc:Ignorable="w14 w15">
<w:docDefaults>${docDefaults}</w:docDefaults>
<w:style w:type="paragraph" w:styleId="Normal">
<w:name w:val="Normal"/>
<w:qFormat/>
</w:style>
<w:style w:type="paragraph" w:styleId="Heading1">
<w:name w:val="Heading 1"/>
<w:basedOn w:val="Normal"/>
<w:next w:val="Normal"/>
<w:link w:val="Heading1Char"/>
<w:uiPriority w:val="9"/>
<w:qFormat/>
<w:rsid w:val="00F17435"/>
<w:pPr>
<w:keepNext/>
<w:keepLines/>
<w:spacing w:before="480" w:after="0"/>
<w:outlineLvl w:val="0"/>
</w:pPr>
<w:rPr>
<w:rFonts w:asciiTheme="majorHAnsi" w:eastAsiaTheme="majorEastAsia" w:hAnsiTheme="majorHAnsi" w:cstheme="majorBidi"/>
<w:b/>
<w:bCs/>
<w:color w:val="2E74B5" w:themeColor="accent1" w:themeShade="BF"/>
<w:sz w:val="32"/>
<w:szCs w:val="32"/>
</w:rPr>
</w:style>
<w:style w:type="paragraph" w:styleId="Heading2">
<w:name w:val="Heading 2"/>
<w:basedOn w:val="Normal"/>
<w:next w:val="Normal"/>
<w:link w:val="Heading2Char"/>
<w:uiPriority w:val="9"/>
<w:unhideWhenUsed/>
<w:qFormat/>
<w:rsid w:val="00F17435"/>
<w:pPr>
<w:keepNext/>
<w:keepLines/>
<w:spacing w:before="260" w:after="260"/>
<w:outlineLvl w:val="1"/>
</w:pPr>
<w:rPr>
<w:rFonts w:asciiTheme="majorHAnsi" w:eastAsiaTheme="majorEastAsia" w:hAnsiTheme="majorHAnsi" w:cstheme="majorBidi"/>
<w:b/>
<w:bCs/>
<w:color w:val="2E74B5" w:themeColor="accent1" w:themeShade="BF"/>
<w:sz w:val="26"/>
<w:szCs w:val="26"/>
</w:rPr>
</w:style>
<w:style w:type="paragraph" w:styleId="Heading3">
<w:name w:val="Heading 3"/>
<w:basedOn w:val="Normal"/>
<w:next w:val="Normal"/>
<w:link w:val="Heading3Char"/>
<w:uiPriority w:val="9"/>
<w:unhideWhenUsed/>
<w:qFormat/>
<w:rsid w:val="00F17435"/>
<w:pPr>
<w:keepNext/>
<w:keepLines/>
<w:spacing w:before="260" w:after="260"/>
<w:outlineLvl w:val="2"/>
</w:pPr>
<w:rPr>
<w:rFonts w:asciiTheme="majorHAnsi" w:eastAsiaTheme="majorEastAsia" w:hAnsiTheme="majorHAnsi" w:cstheme="majorBidi"/>
<w:b/>
<w:bCs/>
<w:color w:val="1F4D78" w:themeColor="accent1" w:themeShade="7F"/>
<w:sz w:val="24"/>
<w:szCs w:val="24"/>
</w:rPr>
</w:style>
</w:styles>`;
    }

    /**
     * Update [Content_Types].xml logic
     */
    private async updateContentTypesXml(zip: JSZip): Promise<void> {
        const contentTypesXml = await zip.file('[Content_Types].xml')?.async('string');
        if (!contentTypesXml) return;

        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '',
            ignoreDeclaration: true,
        });
        const contentTypes = parser.parse(contentTypesXml);

        // Defensive: ensure we never re-emit an XML declaration from the parsed object
        // (fast-xml-parser can preserve it depending on options / input).
        // If we prepend our own declaration, leaving this in would create a duplicate declaration.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (contentTypes as any)['?xml'];

        // Ensure <Types> exists and has Overrides
        if (!contentTypes.Types) return;

        // Ensure Overrides is always an array
        let overrides = contentTypes.Types.Override || [];
        if (!Array.isArray(overrides)) {
            overrides = [overrides];
        }

        const existingParts = new Set<string>(overrides.map((o: { PartName: string }) => o.PartName));
        let modified = false;

        // Check for numbering.xml
        if (zip.file('word/numbering.xml') && !existingParts.has('/word/numbering.xml')) {
            overrides.push({
                PartName: '/word/numbering.xml',
                ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml'
            });
            modified = true;
        }

        // Check for comments.xml
        if (this.comments.length > 0 && !existingParts.has('/word/comments.xml')) {
            overrides.push({
                PartName: '/word/comments.xml',
                ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml'
            });
            modified = true;
        }

        if (modified) {
            contentTypes.Types.Override = overrides;
            const builder = new XMLBuilder({
                ignoreAttributes: false,
                attributeNamePrefix: '',
                format: true,
                suppressEmptyNode: true,
            });
            zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${builder.build(contentTypes)}`);
        }
    }

    /**
     * Update word/_rels/document.xml.rels logic
     */
    private async updateDocumentRelsXml(zip: JSZip): Promise<void> {
        const relsXml = await zip.file('word/_rels/document.xml.rels')?.async('string');
        if (!relsXml) return;

        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '',
            ignoreDeclaration: true,
        });
        const rels = parser.parse(relsXml);

        // Defensive: ensure we never re-emit an XML declaration from the parsed object.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (rels as any)['?xml'];

        if (!rels.Relationships) return;

        let relationships = rels.Relationships.Relationship || [];
        if (!Array.isArray(relationships)) {
            relationships = [relationships];
        }

        // Get max rId
        let maxId = 0;
        const existingTargets = new Set<string>();

        relationships.forEach((rel: { Id?: string; Target?: string }) => {
            if (rel.Id && rel.Id.startsWith('rId')) {
                const id = parseInt(rel.Id.substring(3));
                if (!isNaN(id) && id > maxId) maxId = id;
            }
            if (rel.Target) {
                existingTargets.add(rel.Target);
            }
        });

        let modified = false;

        // Add numbering relationship if needed
        if (zip.file('word/numbering.xml') && !existingTargets.has('numbering.xml')) {
            maxId++;
            relationships.push({
                Id: `rId${maxId}`,
                Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering',
                Target: 'numbering.xml'
            });
            modified = true;
        }

        // Add comments relationship if needed
        if (this.comments.length > 0 && !existingTargets.has('comments.xml')) {
            maxId++;
            relationships.push({
                Id: `rId${maxId}`,
                Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments',
                Target: 'comments.xml'
            });
            modified = true;
        }

        if (modified) {
            rels.Relationships.Relationship = relationships;
            const builder = new XMLBuilder({
                ignoreAttributes: false,
                attributeNamePrefix: '',
                format: true,
                suppressEmptyNode: true,
            });
            zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${builder.build(rels)}`);
        }
    }



    /**
    * Get word/numbering.xml - defines list numbering formats
    */
    private getNumberingXml(onlyDefinitions: boolean = false): string {
        // Create unique abstract numbering definition for each numId
        // This ensures each list starts numbering from 1
        const dynamicAbstractNums = this.usedNumIds
            .map((numId, index) => {
                // abstractNumId starts at 10 to leave room for base definitions
                const abstractNumId = 10 + index;
                // Check if this numId has a specific start value
                const startVal = this.numIdStarts[numId] || 1;

                return `<w:abstractNum w:abstractNumId="${abstractNumId}">
<w:lvl w:ilvl="0"><w:start w:val="${startVal}"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="480" w:hanging="360"/></w:pPr></w:lvl>
<w:lvl w:ilvl="1"><w:start w:val="${startVal}"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%2."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="900" w:hanging="360"/></w:pPr></w:lvl>
<w:lvl w:ilvl="2"><w:start w:val="${startVal}"/><w:numFmt w:val="bullet"/><w:lvlText w:val="■"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="2160" w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:eastAsia="Arial" w:hAnsi="Arial" w:cs="Arial"/></w:rPr></w:lvl>
<w:lvl w:ilvl="3"><w:start w:val="${startVal}"/><w:numFmt w:val="bullet"/><w:lvlText w:val="■"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="2880" w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:eastAsia="Arial" w:hAnsi="Arial" w:cs="Arial"/></w:rPr></w:lvl>
</w:abstractNum>`;
            })
            .join('\n');

        // Map each numId to its unique abstractNumId
        const dynamicNumInstances = this.usedNumIds
            .map((numId, index) => {
                const abstractNumId = 10 + index;
                return `<w:num w:numId="${numId}"><w:abstractNumId w:val="${abstractNumId}"/></w:num>`;
            })
            .join('\n');

        if (onlyDefinitions) {
            return `${dynamicAbstractNums}\n${dynamicNumInstances}`;
        }

        // Only include base numbering instances for numIds not already defined dynamically
        const baseInstances: string[] = [];
        if (!this.usedNumIds.includes(1)) {
            baseInstances.push('<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>');
        }
        if (!this.usedNumIds.includes(2)) {
            baseInstances.push('<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>');
        }

        return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<!-- Abstract numbering definition for bullets -->
<w:abstractNum w:abstractNumId="0">
<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>
<w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="◦"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="1440" w:hanging="360"/></w:pPr></w:lvl>
<w:lvl w:ilvl="2"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="▪"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="2160" w:hanging="360"/></w:pPr></w:lvl>
</w:abstractNum>
<!-- Abstract numbering definition for ordered lists (fallback) -->
<w:abstractNum w:abstractNumId="1">
<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="480" w:hanging="360"/></w:pPr></w:lvl>
<w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%2."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="900" w:hanging="360"/></w:pPr></w:lvl>
<w:lvl w:ilvl="2"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="■"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="2160" w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:eastAsia="Arial" w:hAnsi="Arial" w:cs="Arial"/></w:rPr></w:lvl>
<w:lvl w:ilvl="3"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="■"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="2880" w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:eastAsia="Arial" w:hAnsi="Arial" w:cs="Arial"/></w:rPr></w:lvl>
</w:abstractNum>
<!-- Dynamic abstract numbering for each unique list -->
${dynamicAbstractNums}
<!-- Base numbering instances (only for unused numIds) -->
${baseInstances.join('\n')}
<!-- Dynamic numbering instances mapped to unique abstractNums -->
${dynamicNumInstances}
</w:numbering>`;
    }
}
