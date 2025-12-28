/* eslint-disable @typescript-eslint/no-explicit-any */
import JSZip from 'jszip';

/**
 * Tiptap JSON content type
 */
interface JSONContent {
    type: string;
    attrs?: Record<string, any>;
    content?: JSONContent[];
    text?: string;
    marks?: Array<{
        type: string;
        attrs?: Record<string, any>;
    }>;
}

/**
 * Comment data extracted from content
 */
interface CommentData {
    id: string;
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
            // For now, we trust existing document.xml.rels to contain necessary relationships
            // TODO: If we start adding images/hyperlinks, we MUST parse and merge .rels
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

        // Generate blob
        return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
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
    private serializeDocument(content: JSONContent[], docAttrs?: any): string {
        const bodyContent = content.map(node => this.serializeNode(node, 0)).join('');

        let sectPr = '';
        // If we have captured section properties, use them for fidelity
        if (docAttrs && (docAttrs.pageSize || docAttrs.pageMargins || docAttrs.docGrid)) {
            sectPr += '<w:sectPr>';

            // Page Size
            if (docAttrs.pageSize) {
                const w = docAttrs.pageSize['w:w'] || docAttrs.pageSize['w'] || '11906';
                const h = docAttrs.pageSize['w:h'] || docAttrs.pageSize['h'] || '16838';
                sectPr += `<w:pgSz w:w="${w}" w:h="${h}"/>`;
            } else {
                sectPr += `<w:pgSz w:w="11906" w:h="16838"/>`;
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
            } else {
                sectPr += `<w:pgMar w:top="1985" w:right="1701" w:bottom="1701" w:left="1701" w:header="708" w:footer="708" w:gutter="0"/>`;
            }

            // Columns (default to 1)
            sectPr += `<w:cols w:space="708"/>`;

            // Document Grid - Critical for Japanese spacing
            if (docAttrs.docGrid) {
                const linePitch = docAttrs.docGrid['w:linePitch'] || '360';
                const type = docAttrs.docGrid['w:type'] || 'lines';
                sectPr += `<w:docGrid w:linePitch="${linePitch}" w:type="${type}"/>`;
            } else {
                // Formatting fallback: If we have page size but missed docGrid, default to standard CJK grid
                // to prevent Word from defaulting to a behavior that breaks line spacing.
                sectPr += `<w:docGrid w:linePitch="360" w:type="lines"/>`;
            }

            sectPr += '</w:sectPr>';
        } else {
            // Default A4 if no attributes captured
            sectPr = `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1985" w:right="1701" w:bottom="1701" w:left="1701" w:header="708" w:footer="708" w:gutter="0"/><w:cols w:space="708"/><w:docGrid w:linePitch="360" w:type="lines"/></w:sectPr>`;
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

        // Add list properties if this is a list item
        if (listInfo) {
            pPr += `<w:numPr><w:ilvl w:val="${listInfo.ilvl}"/><w:numId w:val="${listInfo.numId}"/></w:numPr>`;
        }

        // Add spacing (lineHeight, spacingBefore, spacingAfter)
        // lineHeight from DocxReader is already in twips (raw value from w:spacing w:line)
        if (node.attrs?.snapToGrid) {
            pPr += `<w:snapToGrid w:val="${node.attrs.snapToGrid}"/>`;
        }
        if (node.attrs?.contextualSpacing) {
            pPr += `<w:contextualSpacing w:val="${node.attrs.contextualSpacing}"/>`;
        }

        if (node.attrs?.lineHeight || node.attrs?.spacingBefore || node.attrs?.spacingAfter) {
            let spacingAttrs = '';
            if (node.attrs?.spacingBefore) {
                spacingAttrs += ` w:before="${node.attrs.spacingBefore}"`;
            }
            if (node.attrs?.spacingAfter) {
                spacingAttrs += ` w:after="${node.attrs.spacingAfter}"`;
            }
            if (node.attrs?.lineHeight) {
                const rule = node.attrs.lineRule || 'auto';
                spacingAttrs += ` w:line="${node.attrs.lineHeight}" w:lineRule="${rule}"`;
            }
            pPr += `<w:spacing${spacingAttrs}/>`;
        }

        // Add text alignment
        if (node.attrs?.textAlign) {
            const alignMap: Record<string, string> = {
                'left': 'left',
                'center': 'center',
                'right': 'right',
                'justify': 'both'
            };
            pPr += `<w:jc w:val="${alignMap[node.attrs.textAlign] || 'left'}"/>`;
        }

        // Add indentation
        if (node.attrs?.indent || node.attrs?.hanging || node.attrs?.firstLine) {
            let pPrIndent = '';

            if (node.attrs?.indent) {
                const val = parseInt(node.attrs.indent);
                // Heuristic: values > 20 are likely already twips (from Reader), 
                // values <= 20 are likely levels (from Editor).
                // 20 levels = 10 inches, unlikely to be exceeded by normal levels.
                const indentTwips = val > 20 ? val : val * 720;
                pPrIndent += ` w:left="${indentTwips}"`;
            }

            if (node.attrs?.hanging) {
                pPrIndent += ` w:hanging="${node.attrs.hanging}"`;
            }

            if (node.attrs?.firstLine) {
                pPrIndent += ` w:firstLine="${node.attrs.firstLine}"`;
            }

            if (pPrIndent) {
                pPr += `<w:ind${pPrIndent}/>`;
            }
        }

        if (node.attrs?.contextualSpacing) {
            pPr += `<w:contextualSpacing w:val="${node.attrs.contextualSpacing}"/>`;
        }

        const pPrXml = pPr ? `<w:pPr>${pPr}</w:pPr>` : '';
        const content = this.serializeParagraphContent(node.content || []);

        return `<w:p>${pPrXml}${content}</w:p>`;
    }

    /**
     * Serialize paragraph content (text runs with marks)
     */
    private serializeParagraphContent(content: JSONContent[]): string {
        return content.map(child => {
            if (child.type === 'text') {
                return this.serializeTextRun(child);
            }
            return this.serializeNode(child);
        }).join('');
    }

    /**
     * Serialize heading
     */
    private serializeHeading(node: JSONContent): string {
        const level = node.attrs?.level || 1;
        const content = this.serializeParagraphContent(node.content || []);

        let pPr = `<w:pStyle w:val="Heading${level}"/>`;

        if (node.attrs?.snapToGrid) {
            pPr += `<w:snapToGrid w:val="${node.attrs.snapToGrid}"/>`;
        }

        // Add spacing (lineHeight, spacingBefore, spacingAfter)
        if (node.attrs?.lineHeight || node.attrs?.spacingBefore || node.attrs?.spacingAfter) {
            let spacingAttrs = '';
            if (node.attrs?.spacingBefore) {
                spacingAttrs += ` w:before="${node.attrs.spacingBefore}"`;
            }
            if (node.attrs?.spacingAfter) {
                spacingAttrs += ` w:after="${node.attrs.spacingAfter}"`;
            }
            if (node.attrs?.lineHeight) {
                const rule = node.attrs.lineRule || 'auto';
                spacingAttrs += ` w:line="${node.attrs.lineHeight}" w:lineRule="${rule}"`;
            }
            pPr += `<w:spacing${spacingAttrs}/>`;
        }

        // Add text alignment
        if (node.attrs?.textAlign) {
            const alignMap: Record<string, string> = {
                'left': 'left',
                'center': 'center',
                'right': 'right',
                'justify': 'both'
            };
            pPr += `<w:jc w:val="${alignMap[node.attrs.textAlign] || 'left'}"/>`;
        }

        if (node.attrs?.contextualSpacing) {
            pPr += `<w:contextualSpacing w:val="${node.attrs.contextualSpacing}"/>`;
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
        const commentMark = marks.find(m => m.type === 'comment');

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
                        rPr += `<w:color w:val="${this.colorToDocx(mark.attrs.color)}"/>`;
                    }
                    if (mark.attrs?.fontSize) {
                        const halfPts = this.fontSizeToHalfPoints(mark.attrs.fontSize);
                        rPr += `<w:sz w:val="${halfPts}"/>`;
                    }
                    if (mark.attrs?.fontFamily) {
                        const font = this.escapeXml(mark.attrs.fontFamily);
                        rPr += `<w:rFonts w:ascii="${font}" w:eastAsia="${font}" w:hAnsi="${font}" w:cs="${font}"/>`;
                    }
                    break;
                case 'highlight':
                    if (mark.attrs?.color) {
                        rPr += `<w:highlight w:val="${this.highlightColorToDocx(mark.attrs.color)}"/>`;
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
            const id = this.insertionIdCounter++;
            const author = insertionMark.attrs?.author || 'Unknown';
            const date = insertionMark.attrs?.date || new Date().toISOString();
            runXml = `<w:ins w:id="${id}" w:author="${this.escapeXml(author)}" w:date="${date}">${runXml}</w:ins>`;
        }

        if (deletionMark) {
            const id = this.deletionIdCounter++;
            const author = deletionMark.attrs?.author || 'Unknown';
            const date = deletionMark.attrs?.date || new Date().toISOString();
            runXml = `<w:del w:id="${id}" w:author="${this.escapeXml(author)}" w:date="${date}">${runXml}</w:del>`;
        }

        // Handle comments
        if (commentMark) {
            const commentId = commentMark.attrs?.commentId || String(this.comments.length);
            const author = commentMark.attrs?.author || 'Unknown';
            const date = commentMark.attrs?.date || new Date().toISOString();
            const content = commentMark.attrs?.content || '';

            // Add to comments collection
            if (!this.comments.find(c => c.id === commentId)) {
                this.comments.push({ id: commentId, author, date, content });
            }

            // Wrap with comment range markers
            runXml = `<w:commentRangeStart w:id="${commentId}"/>${runXml}<w:commentRangeEnd w:id="${commentId}"/><w:r><w:commentReference w:id="${commentId}"/></w:r>`;
        }

        return runXml;
    }

    /**
     * Serialize list (bullet or ordered)
     * For top-level lists (level=0), use unique numId to reset numbering
     */
    private serializeList(node: JSONContent, isOrdered: boolean, level: number): string {
        const items = node.content || [];
        const effectiveLevel = node.attrs?.level !== undefined ? parseInt(node.attrs.level) : level;

        // Use original numId if available (for round-trip fidelity)
        let numId: number;

        // Check for specific start value (e.g. continuing a list after interruption)
        if (isOrdered && node.attrs?.start && node.attrs.start > 1) {
            numId = this.nextNumId++;
            this.numIdStarts[numId] = parseInt(node.attrs.start);
            this.usedNumIds.push(numId);
        } else if (node.attrs?.originalNumId) {
            numId = parseInt(node.attrs.originalNumId);
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
            return `<w:comment w:id="${comment.id}" w:author="${this.escapeXml(comment.author)}" w:date="${comment.date}">
<w:p><w:r><w:t>${this.escapeXml(comment.content)}</w:t></w:r></w:p>
</w:comment>`;
        }).join('\n');

        return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
${commentsXml}
</w:comments>`;
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
    private getStylesXml(docAttrs?: any): string {
        let docDefaults = '';
        if (docAttrs?.docDefaults) {
            const d = docAttrs.docDefaults;
            let rPrInner = '';

            // Fonts
            if (d.rFonts) {
                const attrs = d.rFonts[':@'] || d.rFonts;
                let fontAttrs = '';
                Object.keys(attrs).forEach(k => {
                    fontAttrs += ` ${k}="${attrs[k]}"`;
                });
                rPrInner += `<w:rFonts${fontAttrs}/>`;
            }

            // Size
            if (d.sz) {
                const attrs = d.sz[':@'] || d.sz;
                const val = attrs['w:val'] || attrs['val'];
                if (val) rPrInner += `<w:sz w:val="${val}"/>`;
            }
            if (d.szCs) {
                const attrs = d.szCs[':@'] || d.szCs;
                const val = attrs['w:val'] || attrs['val'];
                if (val) rPrInner += `<w:szCs w:val="${val}"/>`;
            }

            if (d.lang) {
                const attrs = d.lang[':@'] || d.lang;
                let langAttrs = '';
                Object.keys(attrs).forEach(k => {
                    langAttrs += ` ${k}="${attrs[k]}"`;
                });
                rPrInner += `<w:lang${langAttrs}/>`;
            }

            let pPrInner = '';
            if (d.pPr) {
                if (d.pPr.widowControl) {
                    pPrInner += `<w:widowControl w:val="${d.pPr.widowControl}"/>`;
                }
            }

            if (rPrInner || pPrInner) {
                docDefaults = `<w:docDefaults>`;
                if (rPrInner) {
                    docDefaults += `<w:rPrDefault><w:rPr>${rPrInner}</w:rPr></w:rPrDefault>`;
                }
                if (pPrInner) {
                    docDefaults += `<w:pPrDefault><w:pPr>${pPrInner}</w:pPr></w:pPrDefault>`;
                }
                docDefaults += `</w:docDefaults>`;
            }
        }

        return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
${docDefaults}
<w:style w:type="paragraph" w:styleId="Normal" w:default="1">
<w:name w:val="Normal"/>
<w:rPr/>
</w:style>
<w:style w:type="paragraph" w:styleId="Heading1">
<w:name w:val="Heading 1"/>
<w:basedOn w:val="Normal"/>
<w:pPr><w:outlineLvl w:val="0"/></w:pPr>
<w:rPr><w:b/><w:sz w:val="32"/></w:rPr>
</w:style>
<w:style w:type="paragraph" w:styleId="Heading2">
<w:name w:val="Heading 2"/>
<w:basedOn w:val="Normal"/>
<w:pPr><w:outlineLvl w:val="1"/></w:pPr>
<w:rPr><w:b/><w:sz w:val="28"/></w:rPr>
</w:style>
<w:style w:type="paragraph" w:styleId="Heading3">
<w:name w:val="Heading 3"/>
<w:basedOn w:val="Normal"/>
<w:pPr><w:outlineLvl w:val="2"/></w:pPr>
<w:rPr><w:b/><w:sz w:val="24"/></w:rPr>
</w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph">
<w:name w:val="List Paragraph"/>
<w:basedOn w:val="Normal"/>
<w:pPr><w:ind w:left="720"/></w:pPr>
</w:style>
</w:styles>`;
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
