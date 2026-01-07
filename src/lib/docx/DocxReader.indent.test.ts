
import { describe, it, expect, beforeEach } from 'vitest';
import JSZip from 'jszip';
import { DocxReader } from './DocxReader';

describe('DocxReader Indentation and Numbering Reproduction', () => {
    let reader: DocxReader;

    beforeEach(() => {
        reader = new DocxReader();
    });

    const createMockDocxWithNumbering = async (documentXmlContent: string, numberingXmlContent: string, stylesXmlContent: string = '') => {
        const zip = new JSZip();

        // [Content_Types].xml
        zip.file('[Content_Types].xml', `
            <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
                <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
                <Default Extension="xml" ContentType="application/xml"/>
                <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
                <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
                <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
            </Types>
        `);

        // _rels/.rels
        zip.file('_rels/.rels', `
            <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
                <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
            </Relationships>
        `);

        // word/_rels/document.xml.rels
        zip.file('word/_rels/document.xml.rels', `
            <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
                <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
                <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
            </Relationships>
        `);

        // word/document.xml
        zip.file('word/document.xml', `
            <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
                <w:body>
                    ${documentXmlContent}
                </w:body>
            </w:document>
        `);

        // word/numbering.xml
        zip.file('word/numbering.xml', `
            <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
                ${numberingXmlContent}
            </w:numbering>
        `);

        // word/styles.xml
        zip.file('word/styles.xml', `
            <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
                ${stylesXmlContent}
            </w:styles>
        `);

        return await zip.generateAsync({ type: 'arraybuffer' });
    };

    it('should extract japanese numbering format "第%1条"', async () => {
        const numbering = `
            <w:abstractNum w:abstractNumId="1">
                <w:lvl w:ilvl="0">
                    <w:start w:val="1"/>
                    <w:numFmt w:val="decimalFullWidth"/>
                    <w:lvlText w:val="第%1条"/>
                    <w:pPr>
                        <w:ind w:left="720" w:hanging="720"/>
                    </w:pPr>
                </w:lvl>
            </w:abstractNum>
            <w:num w:numId="1">
                <w:abstractNumId w:val="1"/>
            </w:num>
        `;

        const content = `
            <w:p>
                <w:pPr>
                    <w:numPr>
                        <w:ilvl w:val="0"/>
                        <w:numId w:val="1"/>
                    </w:numPr>
                </w:pPr>
                <w:r><w:t>Article 1</w:t></w:r>
            </w:p>
        `;

        const buffer = await createMockDocxWithNumbering(content, numbering);
        const result = await reader.load(buffer);

        const list = result.content[0];
        expect(list.type).toBe('orderedList');
        // Check attributes extracted
        expect(list.attrs.numFmt).toBe('decimalFullWidth');
        expect(list.attrs.lvlText).toBe('第%1条');
        expect(list.attrs.originalNumId).toBe('1');
    });

    it('should respect paragraph indent override "0" over numbering indent', async () => {
        // Abstract definition has indent (e.g., 720 twips = 0.5 inch)
        const numbering = `
            <w:abstractNum w:abstractNumId="2">
                <w:lvl w:ilvl="0">
                    <w:start w:val="1"/>
                    <w:numFmt w:val="decimal"/>
                    <w:lvlText w:val="%1."/>
                    <w:pPr>
                        <w:ind w:left="720" w:hanging="720"/>
                    </w:pPr>
                </w:lvl>
            </w:abstractNum>
            <w:num w:numId="2">
                <w:abstractNumId w:val="2"/>
            </w:num>
        `;

        // Paragraph explicitly sets indentation to 0
        const content = `
            <w:p>
                <w:pPr>
                    <w:numPr>
                        <w:ilvl w:val="0"/>
                        <w:numId w:val="2"/>
                    </w:numPr>
                    <w:ind w:left="0" w:hanging="0"/>
                </w:pPr>
                <w:r><w:t>Zero Indent Item</w:t></w:r>
            </w:p>
        `;

        const buffer = await createMockDocxWithNumbering(content, numbering);
        const result = await reader.load(buffer);

        const orderedList = result.content[0];
        // The list should have numIndent from the paragraph override
        expect(orderedList.attrs.numIndent).toBeDefined();
        // Should be '0' (from paragraph) not '720' (from numbering)
        expect(orderedList.attrs.numIndent.left).toBe('0');
        expect(orderedList.attrs.numIndent.hanging).toBe('0');

        // The paragraph inside the list item should NOT have the override indent (moved to list)
        const listItem = orderedList.content[0];
        const paragraph = listItem.content[0];
        expect(paragraph.attrs.indent).toBeUndefined();
        expect(paragraph.attrs.hanging).toBeUndefined();
    });

    it('should extract correct attributes when no indent is present in paragraph but present in numbering', async () => {
        // Just confirming standard behavior
        const numbering = `
            <w:abstractNum w:abstractNumId="3">
                <w:lvl w:ilvl="0">
                    <w:numFmt w:val="decimal"/>
                    <w:pPr>
                        <w:ind w:left="720"/>
                    </w:pPr>
                </w:lvl>
            </w:abstractNum>
            <w:num w:numId="3">
                <w:abstractNumId w:val="3"/>
            </w:num>
        `;

        const content = `
            <w:p>
                <w:pPr>
                    <w:numPr>
                        <w:ilvl w:val="0"/>
                        <w:numId w:val="3"/>
                    </w:numPr>
                </w:pPr>
                <w:r><w:t>Standard Item</w:t></w:r>
            </w:p>
        `;

        const buffer = await createMockDocxWithNumbering(content, numbering);
        const result = await reader.load(buffer);
        const orderedList = result.content[0];
        expect(orderedList.attrs.numIndent.left).toBe('720');
        const paragraph = orderedList.content[0].content[0];
        expect(paragraph.attrs.indent).toBeUndefined();
    });

    it('should extract correct attributes when no indent is present in paragraph but present in numbering', async () => {
        // This test ensures default behavior (numbering indent used) is preserved if NO override exists
        // Copied from existing test logic
        const numbering = `
            <w:abstractNum w:abstractNumId="4">
                <w:lvl w:ilvl="0">
                    <w:start w:val="1"/>
                    <w:numFmt w:val="decimal"/>
                    <w:pPr>
                        <w:ind w:left="720" w:hanging="720"/>
                    </w:pPr>
                </w:lvl>
            </w:abstractNum>
            <w:num w:numId="4">
                <w:abstractNumId w:val="4"/>
            </w:num>
        `;

        const content = `
            <w:p>
                <w:pPr>
                    <w:numPr>
                        <w:ilvl w:val="0"/>
                        <w:numId w:val="4"/>
                    </w:numPr>
                </w:pPr>
                <w:r><w:t>Item with numbering indent</w:t></w:r>
            </w:p>
        `;

        const buffer = await createMockDocxWithNumbering(content, numbering);
        const result = await reader.load(buffer);
        const orderedList = result.content[0];

        // Should use numbering indent
        expect(orderedList.attrs.numIndent).toBeDefined();
        expect(orderedList.attrs.numIndent.left).toBe('720');
    });

    it('should respect style indent override over numbering indent', async () => {
        const numbering = `
            <w:abstractNum w:abstractNumId="5">
                <w:lvl w:ilvl="0">
                    <w:start w:val="1"/>
                    <w:numFmt w:val="decimal"/>
                    <w:lvlText w:val="%1."/>
                    <w:pPr>
                        <w:ind w:left="1440" w:hanging="720"/>
                    </w:pPr>
                </w:lvl>
            </w:abstractNum>
            <w:num w:numId="5">
                <w:abstractNumId w:val="5"/>
            </w:num>
        `;

        // Style defines 0 indent (or different indent)
        const styles = `
            <w:style w:type="paragraph" w:styleId="MyListStyle">
                <w:name w:val="My List Style"/>
                <w:pPr>
                    <w:ind w:left="0" w:hanging="0"/>
                </w:pPr>
            </w:style>
        `;

        const content = `
            <w:p>
                <w:pPr>
                    <w:pStyle w:val="MyListStyle"/>
                    <w:numPr>
                        <w:ilvl w:val="0"/>
                        <w:numId w:val="5"/>
                    </w:numPr>
                    <!-- No direct w:ind -->
                </w:pPr>
                <w:r><w:t>Style Override Item</w:t></w:r>
            </w:p>
        `;

        const buffer = await createMockDocxWithNumbering(content, numbering, styles);
        const result = await reader.load(buffer);

        const orderedList = result.content[0];
        // The list should have numIndent from the style override
        expect(orderedList.attrs.numIndent).toBeDefined();
        // Should be '0' (from style) not '1440' (from numbering)
        expect(orderedList.attrs.numIndent.left).toBe('0');
        expect(orderedList.attrs.numIndent.hanging).toBe('0');

        // The paragraph inside the list item should NOT have the override indent (moved to list)
        const listItem = orderedList.content[0];
        const paragraph = listItem.content[0];
        expect(paragraph.attrs.indent).toBeUndefined();
        expect(paragraph.attrs.hanging).toBeUndefined();
    });
});
