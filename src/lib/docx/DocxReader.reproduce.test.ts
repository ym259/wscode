
import { describe, it, expect } from 'vitest';
import { DocxReader } from './DocxReader';
import JSZip from 'jszip';

describe('DocxReader Heading Parsing Reproduction', () => {
    it('should parse paragraph with Heading style as type="heading"', async () => {
        // 1. Create a minimal valid DOCX with a Heading 1
        const zip = new JSZip();
        zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
        zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
        zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');

        // document.xml with a Heading 1 paragraph
        zip.file('word/document.xml', `
            <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
                <w:body>
                    <w:p>
                        <w:pPr>
                            <w:pStyle w:val="Heading1"/>
                        </w:pPr>
                        <w:r>
                            <w:t>My Title</w:t>
                        </w:r>
                    </w:p>
                </w:body>
            </w:document>
        `);

        // styles.xml defining Heading1
        zip.file('word/styles.xml', `
            <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
                <w:style w:type="paragraph" w:styleId="Heading1">
                    <w:name w:val="Heading 1"/>
                    <w:pPr>
                        <w:outlineLvl w:val="0"/>
                    </w:pPr>
                </w:style>
            </w:styles>
        `);

        // 2. Parse with DocxReader
        const reader = new DocxReader();
        const content = await reader.loadFromZip(zip); // Use loadFromZip directly since we have the zip object

        // 3. Verify
        const headingNode = content.content[0];
        console.log('Parsed Node:', JSON.stringify(headingNode, null, 2));

        expect(headingNode.type).toBe('heading');
        expect(headingNode.attrs).toHaveProperty('level', 1);
    });
});
