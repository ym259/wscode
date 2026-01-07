import { describe, it, expect, beforeEach } from 'vitest';
import { DocxReader } from './DocxReader';
import JSZip from 'jszip';

describe('DocxReader Split List Numbering', () => {
    let reader: DocxReader;

    beforeEach(() => {
        reader = new DocxReader();
    });

    const createMockDocxWithSplitList = async (content: string, numbering: string) => {
        const zip = new JSZip();
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
        zip.file('_rels/.rels', `
            <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
                <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
            </Relationships>
        `);
        zip.file('word/_rels/document.xml.rels', `
            <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
                <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
            </Relationships>
        `);
        zip.file('word/document.xml', `
            <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
                <w:body>${content}</w:body>
            </w:document>
        `);
        zip.file('word/numbering.xml', `
            <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
                ${numbering}
            </w:numbering>
        `);
        zip.file('word/styles.xml', '<w:styles></w:styles>');
        return await zip.generateAsync({ type: 'arraybuffer' });
    };

    it('should continue numbering for split lists with same numId', async () => {
        const numbering = `
            <w:abstractNum w:abstractNumId="1">
                <w:lvl w:ilvl="0">
                    <w:start w:val="1"/>
                    <w:numFmt w:val="decimal"/>
                </w:lvl>
            </w:abstractNum>
            <w:num w:numId="1">
                <w:abstractNumId w:val="1"/>
            </w:num>
        `;

        const content = `
            <w:p>
                <w:pPr>
                    <w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>
                </w:pPr>
                <w:r><w:t>Item 1</w:t></w:r>
            </w:p>
            <w:p>
                <w:r><w:t>Interruption</w:t></w:r>
            </w:p>
            <w:p>
                <w:pPr>
                    <w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>
                </w:pPr>
                <w:r><w:t>Item 2</w:t></w:r>
            </w:p>
        `;

        const buffer = await createMockDocxWithSplitList(content, numbering);
        const result = await reader.load(buffer);

        // Expected: OrderedList (start=1) -> Paragraph (Interruption) -> OrderedList (start=2)
        expect(result.content.length).toBe(3);

        const list2 = result.content[2];
        expect(list2.type).toBe('orderedList');
        // This is the key Check
        expect(list2.attrs.start).toBe(2);
    });
});
