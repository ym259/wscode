
import { describe, it, expect } from 'vitest';
import { DocxWriter } from './DocxWriter';
import JSZip from 'jszip';

describe('DocxWriter Reproduction', () => {
    it('should add Content_Types and Rels entries when adding numbering/comments to a clean DOCX', async () => {
        // 1. Create a minimal valid DOCX in memory
        const zip = new JSZip();
        zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
        zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
        zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
        zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello</w:t></w:r></w:p></w:body></w:document>');
        zip.file('word/styles.xml', '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>');

        // 2. Load into DocxWriter
        const writer = new DocxWriter(zip);

        // 3. Export content with a List and a Comment
        // Tiptap JSON content
        const content = {
            type: 'doc',
            content: [
                {
                    type: 'bulletList',
                    content: [
                        {
                            type: 'listItem',
                            content: [
                                {
                                    type: 'paragraph',
                                    content: [{ type: 'text', text: 'List Item 1' }]
                                }
                            ]
                        }
                    ]
                },
                {
                    type: 'paragraph',
                    content: [
                        {
                            type: 'text',
                            text: 'Commented Text',
                            marks: [
                                {
                                    type: 'comment',
                                    attrs: {
                                        commentId: '1',
                                        author: 'TestUser',
                                        content: 'This is a comment'
                                    }
                                }
                            ]
                        }
                    ]
                }
            ],
            attrs: {} // Add empty attrs
        };

        const blob = await writer.export(content as any);
        const resultZip = await JSZip.loadAsync(blob);

        // 4. Verify Content_Types.xml
        const contentTypes = await resultZip.file('[Content_Types].xml')?.async('string');
        const rels = await resultZip.file('word/_rels/document.xml.rels')?.async('string');

        console.log('Content Types:', contentTypes);
        console.log('Rels:', rels);

        expect(contentTypes).toContain('PartName="/word/numbering.xml"');
        expect(contentTypes).toContain('PartName="/word/comments.xml"');

        // 5. Verify document.xml.rels
        expect(rels).toContain('Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering"');
        expect(rels).toContain('Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments"');

        // Also verify the files actually exist
        expect(resultZip.file('word/numbering.xml')).not.toBeNull();
        expect(resultZip.file('word/comments.xml')).not.toBeNull();
    });
});
