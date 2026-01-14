
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

        // Current model: list items are paragraphs with list metadata (no ol/ul wrapping)
        const paragraph = result.content[0];
        expect(paragraph.type).toBe('paragraph');
        // Check attributes extracted
        expect(paragraph.attrs.listNumFmt).toBe('decimalFullWidth');
        expect(paragraph.attrs.listLvlText).toBe('第%1条');
        expect(paragraph.attrs.listNumId).toBe('1');
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

        const paragraph = result.content[0];
        expect(paragraph.type).toBe('paragraph');
        // The list paragraph should use indentation from the paragraph override (0), not numbering (720)
        expect(paragraph.attrs.listIndentLeft).toBe('0');
        expect(paragraph.attrs.listIndentHanging).toBe('0');
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
        const paragraph = result.content[0];
        expect(paragraph.type).toBe('paragraph');
        expect(paragraph.attrs.listIndentLeft).toBe('720');
        // Paragraph shouldn't carry its own indent in this case (indent comes from numbering)
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
        const paragraph = result.content[0];

        // Should use numbering indent
        expect(paragraph.type).toBe('paragraph');
        expect(paragraph.attrs.listIndentLeft).toBe('720');
        expect(paragraph.attrs.listIndentHanging).toBe('720');
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

        const paragraph = result.content[0];
        expect(paragraph.type).toBe('paragraph');
        // The list paragraph should have indentation from the style override
        expect(paragraph.attrs.listIndentLeft).toBe('0');
        expect(paragraph.attrs.listIndentHanging).toBe('0');
    });

    it('should apply style-based first-line indentation for normal paragraphs', async () => {
        const numbering = ``; // Not needed for this test

        const styles = `
            <w:style w:type="paragraph" w:styleId="IndentedBody">
                <w:name w:val="Indented Body"/>
                <w:pPr>
                    <w:ind w:firstLine="720"/>
                </w:pPr>
            </w:style>
        `;

        const content = `
            <w:p>
                <w:pPr>
                    <w:pStyle w:val="IndentedBody"/>
                </w:pPr>
                <w:r><w:t>First line should be indented</w:t></w:r>
            </w:p>
        `;

        const buffer = await createMockDocxWithNumbering(content, numbering, styles);
        const result = await reader.load(buffer);

        const paragraph = result.content[0];
        expect(paragraph.type).toBe('paragraph');
        expect(paragraph.attrs.firstLine).toBe('720');
        // Ensure we didn't accidentally set left indent when only firstLine is specified
        expect(paragraph.attrs.indent).toBeUndefined();
    });
});
