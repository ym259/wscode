/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest';
import JSZip from 'jszip';
import { DocxReader } from './DocxReader';

describe('DocxReader', () => {
    let reader: DocxReader;

    beforeEach(() => {
        reader = new DocxReader();
    });

    // Helper to create a minimal valid DOCX buffer
    const createMockDocx = async (documentXmlContent: string, stylesXmlContent = '', commentsXmlContent = '') => {
        const zip = new JSZip();

        // 1. [Content_Types].xml (Minimal)
        zip.file('[Content_Types].xml', `
            <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
                <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
                <Default Extension="xml" ContentType="application/xml"/>
                <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
                <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
                ${commentsXmlContent ? '<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>' : ''}
            </Types>
        `);

        // 2. _rels/.rels
        zip.file('_rels/.rels', `
            <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
                <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
            </Relationships>
        `);

        // 3. word/_rels/document.xml.rels
        zip.file('word/_rels/document.xml.rels', `
            <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
                <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
                ${commentsXmlContent ? '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>' : ''}
            </Relationships>
        `);

        // 4. word/document.xml
        zip.file('word/document.xml', `
            <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
                <w:body>
                    ${documentXmlContent}
                </w:body>
            </w:document>
        `);

        // 5. word/styles.xml
        zip.file('word/styles.xml', `
            <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
                ${stylesXmlContent}
            </w:styles>
        `);

        // 6. word/comments.xml (optional)
        if (commentsXmlContent) {
            zip.file('word/comments.xml', `
                <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
                    ${commentsXmlContent}
                </w:comments>
            `);
        }

        return await zip.generateAsync({ type: 'arraybuffer' });
    };

    it('should load a DOCX file and parse basic text', async () => {
        const content = `
            <w:p>
                <w:r>
                    <w:t>Hello World</w:t>
                </w:r>
            </w:p>
        `;
        const buffer = await createMockDocx(content);
        const result = await reader.load(buffer);

        expect(result).toBeDefined();
        // Since we are targeting TipTap JSON structure:
        // { type: 'doc', content: [ { type: 'paragraph', content: [ { type: 'text', text: 'Hello World' } ] } ] }
        expect(result.content).toHaveLength(1);
        expect(result.content[0].type).toBe('paragraph');
        expect(result.content[0].content).toHaveLength(1);
        expect(result.content[0].content[0].text).toBe('Hello World');
    });

    it('should parse paragraph styles (Heading 1)', async () => {
        const content = `
            <w:p>
                <w:pPr>
                    <w:pStyle w:val="Heading1"/>
                </w:pPr>
                <w:r>
                    <w:t>My Title</w:t>
                </w:r>
            </w:p>
        `;
        const styles = `
            <w:style w:type="paragraph" w:styleId="Heading1">
                <w:name w:val="heading 1"/>
            </w:style>
        `;
        const buffer = await createMockDocx(content, styles);
        const result = await reader.load(buffer);

        expect(result.content[0].type).toBe('heading');
        expect(result.content[0].attrs.level).toBe(1);
    });

    it('should parse run formatting (Bold, Italic)', async () => {
        const content = `
            <w:p>
                <w:r>
                    <w:rPr>
                        <w:b/>
                        <w:i/>
                    </w:rPr>
                    <w:t>BoldItalic</w:t>
                </w:r>
            </w:p>
        `;
        const buffer = await createMockDocx(content);
        const result = await reader.load(buffer);

        const textNode = result.content[0].content[0];
        expect(textNode.text).toBe('BoldItalic');
        expect(textNode.marks).toHaveLength(2);
        expect(textNode.marks).toContainEqual({ type: 'bold' });
        expect(textNode.marks).toContainEqual({ type: 'italic' });
    });

    it('should parse tables', async () => {
        const content = `
            <w:tbl>
                <w:tr>
                    <w:tc>
                        <w:p>
                            <w:r><w:t>Cell 1</w:t></w:r>
                        </w:p>
                    </w:tc>
                    <w:tc>
                        <w:p>
                            <w:r><w:t>Cell 2</w:t></w:r>
                        </w:p>
                    </w:tc>
                </w:tr>
            </w:tbl>
        `;
        const buffer = await createMockDocx(content);
        const result = await reader.load(buffer);

        expect(result.content[0].type).toBe('table');
        expect(result.content[0].content).toHaveLength(1); // 1 row
        expect(result.content[0].content[0].type).toBe('tableRow');
        expect(result.content[0].content[0].content).toHaveLength(2); // 2 cells
    });

    it('should handle complex alignment and indentation (Near-Native fidelity)', async () => {
        const content = `
            <w:p>
                <w:pPr>
                    <w:jc w:val="center"/>
                    <w:ind w:left="720"/>
                </w:pPr>
                <w:r>
                    <w:t>Centered Indented</w:t>
                </w:r>
            </w:p>
        `;
        const buffer = await createMockDocx(content);
        const result = await reader.load(buffer);

        const paragraph = result.content[0];
        expect(paragraph.attrs.textAlign).toBe('center');
        // Indent handling depends on how we map it, maybe margin-left or custom attribute
        // Let's assume we map it to style attribute for now or a custom 'indent'
        // For 'Near-Native', we might need granular attributes
        expect(paragraph.attrs.indent).toBeDefined();
    });

    it('should parse advanced run formatting (Color, Size, Highlight, Font)', async () => {
        const content = `
            <w:p>
                <w:r>
                    <w:rPr>
                        <w:color w:val="FF0000"/>
                        <w:sz w:val="24"/>
                        <w:highlight w:val="yellow"/>
                        <w:rFonts w:ascii="Arial"/>
                    </w:rPr>
                    <w:t>Styled Text</w:t>
                </w:r>
            </w:p>
        `;
        const buffer = await createMockDocx(content);
        const result = await reader.load(buffer);

        const textNode = result.content[0].content[0];
        expect(textNode.text).toBe('Styled Text');

        // Check Color (hex)
        const colorMark = textNode.marks.find((m: any) => m.type === 'textStyle' && m.attrs.color);
        expect(colorMark).toBeDefined();
        expect(colorMark.attrs.color).toBe('#FF0000');

        // Check Size (half-points to points)
        const sizeMark = textNode.marks.find((m: any) => m.type === 'textStyle' && m.attrs.fontSize);
        expect(sizeMark).toBeDefined();
        expect(sizeMark.attrs.fontSize).toBe('12pt');

        // Check Font Family
        const fontMark = textNode.marks.find((m: any) => m.type === 'textStyle' && m.attrs.fontFamily);
        expect(fontMark).toBeDefined();
        expect(fontMark.attrs.fontFamily).toBe('Arial');

        // Check Highlight
        const highlightMark = textNode.marks.find((m: any) => m.type === 'highlight');
        expect(highlightMark).toBeDefined();
        expect(highlightMark.attrs.color).toBe('yellow');
    });

    it('should parse nested ordered lists correctly', async () => {
        // Simulate a nested list structure:
        // 1. First level item 1
        //    a. Second level item 1
        //    b. Second level item 2
        // 2. First level item 2
        const content = `
            <w:p>
                <w:pPr>
                    <w:numPr>
                        <w:ilvl w:val="0"/>
                        <w:numId w:val="1"/>
                    </w:numPr>
                </w:pPr>
                <w:r><w:t>First level item 1</w:t></w:r>
            </w:p>
            <w:p>
                <w:pPr>
                    <w:numPr>
                        <w:ilvl w:val="1"/>
                        <w:numId w:val="1"/>
                    </w:numPr>
                </w:pPr>
                <w:r><w:t>Second level item 1</w:t></w:r>
            </w:p>
            <w:p>
                <w:pPr>
                    <w:numPr>
                        <w:ilvl w:val="1"/>
                        <w:numId w:val="1"/>
                    </w:numPr>
                </w:pPr>
                <w:r><w:t>Second level item 2</w:t></w:r>
            </w:p>
            <w:p>
                <w:pPr>
                    <w:numPr>
                        <w:ilvl w:val="0"/>
                        <w:numId w:val="1"/>
                    </w:numPr>
                </w:pPr>
                <w:r><w:t>First level item 2</w:t></w:r>
            </w:p>
        `;
        const buffer = await createMockDocx(content);
        const result = await reader.load(buffer);

        // Should have one orderedList at root
        expect(result.content).toHaveLength(1);
        expect(result.content[0].type).toBe('orderedList');

        const rootList = result.content[0];
        // Should have 2 top-level list items
        expect(rootList.content).toHaveLength(2);

        // First list item should have its paragraph and a nested list
        const firstItem = rootList.content[0];
        expect(firstItem.type).toBe('listItem');
        expect(firstItem.content.length).toBeGreaterThanOrEqual(1);

        // Check for nested list in first item
        const nestedList = firstItem.content.find((c: any) => c.type === 'orderedList');
        expect(nestedList).toBeDefined();
        expect(nestedList.content).toHaveLength(2); // Two nested items

        // Second top-level item
        const secondItem = rootList.content[1];
        expect(secondItem.type).toBe('listItem');
        expect(secondItem.content[0].type).toBe('paragraph');
    });

    it('should parse comments and apply comment marks to text', async () => {
        // Document with a comment on "commented text"
        const content = `
            <w:p>
                <w:r>
                    <w:t>This is </w:t>
                </w:r>
                <w:commentRangeStart w:id="1"/>
                <w:r>
                    <w:t>commented text</w:t>
                </w:r>
                <w:commentRangeEnd w:id="1"/>
                <w:r>
                    <w:commentReference w:id="1"/>
                </w:r>
                <w:r>
                    <w:t> and more text.</w:t>
                </w:r>
            </w:p>
        `;
        const comments = `
            <w:comment w:id="1" w:author="Test Author" w:date="2024-01-15T10:30:00Z">
                <w:p>
                    <w:r>
                        <w:t>This is a test comment</w:t>
                    </w:r>
                </w:p>
            </w:comment>
        `;
        const buffer = await createMockDocx(content, '', comments);
        const result = await reader.load(buffer);

        expect(result.content).toHaveLength(1);
        const paragraph = result.content[0];
        expect(paragraph.type).toBe('paragraph');

        // Should have multiple text nodes
        expect(paragraph.content.length).toBeGreaterThan(1);

        // Find the text node with the comment mark
        const commentedTextNode = paragraph.content.find((node: any) =>
            node.text === 'commented text' &&
            node.marks?.some((mark: any) => mark.type === 'comment')
        );
        expect(commentedTextNode).toBeDefined();

        // Check comment mark attributes
        const commentMark = commentedTextNode.marks.find((m: any) => m.type === 'comment');
        expect(commentMark.attrs.commentId).toBe('1');
        expect(commentMark.attrs.author).toBe('Test Author');
        expect(commentMark.attrs.content).toBe('This is a test comment');
    });
});
