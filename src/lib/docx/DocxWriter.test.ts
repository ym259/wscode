import { describe, it, expect, beforeEach } from 'vitest';
import { DocxWriter } from './DocxWriter';
import JSZip from 'jszip';

describe('DocxWriter', () => {
    let writer: DocxWriter;

    beforeEach(() => {
        writer = new DocxWriter();
    });

    describe('Basic Paragraph Serialization', () => {
        it('should serialize a simple paragraph with text', async () => {
            const content = {
                type: 'doc',
                content: [
                    {
                        type: 'paragraph',
                        content: [{ type: 'text', text: 'Hello World' }]
                    }
                ]
            };

            const blob = await writer.export(content);
            const zip = await JSZip.loadAsync(blob);
            const documentXml = await zip.file('word/document.xml')?.async('string');

            expect(documentXml).toBeDefined();
            expect(documentXml).toContain('<w:t>Hello World</w:t>');
            expect(documentXml).toContain('<w:p>');
            expect(documentXml).toContain('</w:p>');
        });

        it('should serialize an empty paragraph', async () => {
            const content = {
                type: 'doc',
                content: [{ type: 'paragraph', content: [] }]
            };

            const blob = await writer.export(content);
            const zip = await JSZip.loadAsync(blob);
            const documentXml = await zip.file('word/document.xml')?.async('string');

            expect(documentXml).toContain('<w:p>');
        });

        it('should handle paragraph with multiple text nodes', async () => {
            const content = {
                type: 'doc',
                content: [
                    {
                        type: 'paragraph',
                        content: [
                            { type: 'text', text: 'Hello ' },
                            { type: 'text', text: 'World' }
                        ]
                    }
                ]
            };

            const blob = await writer.export(content);
            const zip = await JSZip.loadAsync(blob);
            const documentXml = await zip.file('word/document.xml')?.async('string');

            expect(documentXml).toContain('<w:t>Hello </w:t>');
            expect(documentXml).toContain('<w:t>World</w:t>');
        });
    });

    describe('Text Formatting (Marks)', () => {
        it('should serialize bold text', async () => {
            const content = {
                type: 'doc',
                content: [
                    {
                        type: 'paragraph',
                        content: [
                            { type: 'text', text: 'Bold', marks: [{ type: 'bold' }] }
                        ]
                    }
                ]
            };

            const blob = await writer.export(content);
            const zip = await JSZip.loadAsync(blob);
            const documentXml = await zip.file('word/document.xml')?.async('string');

            expect(documentXml).toContain('<w:b/>');
            expect(documentXml).toContain('<w:t>Bold</w:t>');
        });

        it('should serialize italic text', async () => {
            const content = {
                type: 'doc',
                content: [
                    {
                        type: 'paragraph',
                        content: [
                            { type: 'text', text: 'Italic', marks: [{ type: 'italic' }] }
                        ]
                    }
                ]
            };

            const blob = await writer.export(content);
            const zip = await JSZip.loadAsync(blob);
            const documentXml = await zip.file('word/document.xml')?.async('string');

            expect(documentXml).toContain('<w:i/>');
        });

        it('should serialize underlined text', async () => {
            const content = {
                type: 'doc',
                content: [
                    {
                        type: 'paragraph',
                        content: [
                            { type: 'text', text: 'Underline', marks: [{ type: 'underline' }] }
                        ]
                    }
                ]
            };

            const blob = await writer.export(content);
            const zip = await JSZip.loadAsync(blob);
            const documentXml = await zip.file('word/document.xml')?.async('string');

            expect(documentXml).toContain('<w:u w:val="single"/>');
        });

        it('should serialize text with multiple marks', async () => {
            const content = {
                type: 'doc',
                content: [
                    {
                        type: 'paragraph',
                        content: [
                            {
                                type: 'text',
                                text: 'BoldItalic',
                                marks: [{ type: 'bold' }, { type: 'italic' }]
                            }
                        ]
                    }
                ]
            };

            const blob = await writer.export(content);
            const zip = await JSZip.loadAsync(blob);
            const documentXml = await zip.file('word/document.xml')?.async('string');

            expect(documentXml).toContain('<w:b/>');
            expect(documentXml).toContain('<w:i/>');
        });

        it('should serialize text color', async () => {
            const content = {
                type: 'doc',
                content: [
                    {
                        type: 'paragraph',
                        content: [
                            {
                                type: 'text',
                                text: 'Red',
                                marks: [{ type: 'textStyle', attrs: { color: '#ff0000' } }]
                            }
                        ]
                    }
                ]
            };

            const blob = await writer.export(content);
            const zip = await JSZip.loadAsync(blob);
            const documentXml = await zip.file('word/document.xml')?.async('string');

            expect(documentXml).toContain('<w:color w:val="FF0000"/>');
        });

        it('should serialize font size', async () => {
            const content = {
                type: 'doc',
                content: [
                    {
                        type: 'paragraph',
                        content: [
                            {
                                type: 'text',
                                text: 'Big',
                                marks: [{ type: 'textStyle', attrs: { fontSize: '24pt' } }]
                            }
                        ]
                    }
                ]
            };

            const blob = await writer.export(content);
            const zip = await JSZip.loadAsync(blob);
            const documentXml = await zip.file('word/document.xml')?.async('string');

            // DOCX uses half-points, so 24pt = 48 half-points
            expect(documentXml).toContain('<w:sz w:val="48"/>');
        });

        it('should serialize highlight color', async () => {
            const content = {
                type: 'doc',
                content: [
                    {
                        type: 'paragraph',
                        content: [
                            {
                                type: 'text',
                                text: 'Highlighted',
                                marks: [{ type: 'highlight', attrs: { color: '#ffff00' } }]
                            }
                        ]
                    }
                ]
            };

            const blob = await writer.export(content);
            const zip = await JSZip.loadAsync(blob);
            const documentXml = await zip.file('word/document.xml')?.async('string');

            expect(documentXml).toContain('<w:highlight w:val="yellow"/>');
        });
    });

    describe('Headings', () => {
        it('should serialize heading level 1', async () => {
            const content = {
                type: 'doc',
                content: [
                    {
                        type: 'heading',
                        attrs: { level: 1 },
                        content: [{ type: 'text', text: 'Title' }]
                    }
                ]
            };

            const blob = await writer.export(content);
            const zip = await JSZip.loadAsync(blob);
            const documentXml = await zip.file('word/document.xml')?.async('string');

            expect(documentXml).toContain('<w:pStyle w:val="Heading1"/>');
            expect(documentXml).toContain('<w:t>Title</w:t>');
        });

        it('should serialize heading level 2', async () => {
            const content = {
                type: 'doc',
                content: [
                    {
                        type: 'heading',
                        attrs: { level: 2 },
                        content: [{ type: 'text', text: 'Subtitle' }]
                    }
                ]
            };

            const blob = await writer.export(content);
            const zip = await JSZip.loadAsync(blob);
            const documentXml = await zip.file('word/document.xml')?.async('string');

            expect(documentXml).toContain('<w:pStyle w:val="Heading2"/>');
        });
    });

    describe('Lists', () => {
        it('should serialize bullet list', async () => {
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
                                        content: [{ type: 'text', text: 'Item 1' }]
                                    }
                                ]
                            },
                            {
                                type: 'listItem',
                                content: [
                                    {
                                        type: 'paragraph',
                                        content: [{ type: 'text', text: 'Item 2' }]
                                    }
                                ]
                            }
                        ]
                    }
                ]
            };

            const blob = await writer.export(content);
            const zip = await JSZip.loadAsync(blob);
            const documentXml = await zip.file('word/document.xml')?.async('string');

            expect(documentXml).toContain('<w:numPr>');
            expect(documentXml).toContain('<w:ilvl w:val="0"/>');
            expect(documentXml).toContain('<w:t>Item 1</w:t>');
            expect(documentXml).toContain('<w:t>Item 2</w:t>');
        });

        it('should serialize ordered list', async () => {
            const content = {
                type: 'doc',
                content: [
                    {
                        type: 'orderedList',
                        content: [
                            {
                                type: 'listItem',
                                content: [
                                    {
                                        type: 'paragraph',
                                        content: [{ type: 'text', text: 'First' }]
                                    }
                                ]
                            }
                        ]
                    }
                ]
            };

            const blob = await writer.export(content);
            const zip = await JSZip.loadAsync(blob);
            const documentXml = await zip.file('word/document.xml')?.async('string');

            expect(documentXml).toContain('<w:numPr>');
            // Ordered lists should have a different numId than bullet lists
            expect(documentXml).toContain('<w:t>First</w:t>');
        });

        it('should serialize nested lists with correct ilvl', async () => {
            const content = {
                type: 'doc',
                content: [
                    {
                        type: 'orderedList',
                        content: [
                            {
                                type: 'listItem',
                                content: [
                                    {
                                        type: 'paragraph',
                                        content: [{ type: 'text', text: 'Parent' }]
                                    },
                                    {
                                        type: 'orderedList',
                                        content: [
                                            {
                                                type: 'listItem',
                                                content: [
                                                    {
                                                        type: 'paragraph',
                                                        content: [{ type: 'text', text: 'Child' }]
                                                    }
                                                ]
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                ]
            };

            const blob = await writer.export(content);
            const zip = await JSZip.loadAsync(blob);
            const documentXml = await zip.file('word/document.xml')?.async('string');

            expect(documentXml).toContain('<w:ilvl w:val="0"/>');
            expect(documentXml).toContain('<w:ilvl w:val="1"/>');
        });
    });

    describe('Tables', () => {
        it('should serialize a simple table', async () => {
            const content = {
                type: 'doc',
                content: [
                    {
                        type: 'table',
                        content: [
                            {
                                type: 'tableRow',
                                content: [
                                    {
                                        type: 'tableCell',
                                        content: [
                                            {
                                                type: 'paragraph',
                                                content: [{ type: 'text', text: 'Cell 1' }]
                                            }
                                        ]
                                    },
                                    {
                                        type: 'tableCell',
                                        content: [
                                            {
                                                type: 'paragraph',
                                                content: [{ type: 'text', text: 'Cell 2' }]
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                ]
            };

            const blob = await writer.export(content);
            const zip = await JSZip.loadAsync(blob);
            const documentXml = await zip.file('word/document.xml')?.async('string');

            expect(documentXml).toContain('<w:tbl>');
            expect(documentXml).toContain('<w:tr>');
            expect(documentXml).toContain('<w:tc>');
            expect(documentXml).toContain('<w:t>Cell 1</w:t>');
            expect(documentXml).toContain('<w:t>Cell 2</w:t>');
        });
    });

    describe('Track Changes', () => {
        it('should serialize insertion mark', async () => {
            const content = {
                type: 'doc',
                content: [
                    {
                        type: 'paragraph',
                        content: [
                            {
                                type: 'text',
                                text: 'inserted text',
                                marks: [{
                                    type: 'insertion',
                                    attrs: { author: 'Test User', date: '2024-01-01T00:00:00Z' }
                                }]
                            }
                        ]
                    }
                ]
            };

            const blob = await writer.export(content);
            const zip = await JSZip.loadAsync(blob);
            const documentXml = await zip.file('word/document.xml')?.async('string');

            expect(documentXml).toContain('<w:ins');
            expect(documentXml).toContain('w:author="Test User"');
            expect(documentXml).toContain('<w:t>inserted text</w:t>');
            expect(documentXml).toContain('</w:ins>');
        });

        it('should serialize deletion mark', async () => {
            const content = {
                type: 'doc',
                content: [
                    {
                        type: 'paragraph',
                        content: [
                            {
                                type: 'text',
                                text: 'deleted text',
                                marks: [{
                                    type: 'deletion',
                                    attrs: { author: 'Test User', date: '2024-01-01T00:00:00Z' }
                                }]
                            }
                        ]
                    }
                ]
            };

            const blob = await writer.export(content);
            const zip = await JSZip.loadAsync(blob);
            const documentXml = await zip.file('word/document.xml')?.async('string');

            expect(documentXml).toContain('<w:del');
            expect(documentXml).toContain('w:author="Test User"');
            expect(documentXml).toContain('<w:delText>deleted text</w:delText>');
            expect(documentXml).toContain('</w:del>');
        });

        it('should handle mixed track changes in same paragraph', async () => {
            const content = {
                type: 'doc',
                content: [
                    {
                        type: 'paragraph',
                        content: [
                            { type: 'text', text: 'normal ' },
                            {
                                type: 'text',
                                text: 'deleted',
                                marks: [{ type: 'deletion', attrs: { author: 'AI' } }]
                            },
                            {
                                type: 'text',
                                text: 'inserted',
                                marks: [{ type: 'insertion', attrs: { author: 'AI' } }]
                            }
                        ]
                    }
                ]
            };

            const blob = await writer.export(content);
            const zip = await JSZip.loadAsync(blob);
            const documentXml = await zip.file('word/document.xml')?.async('string');

            expect(documentXml).toContain('<w:t>normal </w:t>');
            expect(documentXml).toContain('<w:del');
            expect(documentXml).toContain('<w:ins');
        });
    });

    describe('Comments', () => {
        it('should serialize comment mark and create comments.xml', async () => {
            const content = {
                type: 'doc',
                content: [
                    {
                        type: 'paragraph',
                        content: [
                            {
                                type: 'text',
                                text: 'commented text',
                                marks: [{
                                    type: 'comment',
                                    attrs: {
                                        commentId: '1',
                                        author: 'Reviewer',
                                        date: '2024-01-01T00:00:00Z',
                                        content: 'This is a comment'
                                    }
                                }]
                            }
                        ]
                    }
                ]
            };

            const blob = await writer.export(content);
            const zip = await JSZip.loadAsync(blob);
            const documentXml = await zip.file('word/document.xml')?.async('string');
            const commentsXml = await zip.file('word/comments.xml')?.async('string');

            // Document should have comment range markers
            expect(documentXml).toContain('<w:commentRangeStart w:id="1"/>');
            expect(documentXml).toContain('<w:commentRangeEnd w:id="1"/>');
            expect(documentXml).toContain('<w:commentReference w:id="1"/>');

            // Comments.xml should exist and contain the comment
            expect(commentsXml).toBeDefined();
            expect(commentsXml).toContain('<w:comment');
            expect(commentsXml).toContain('w:id="1"');
            expect(commentsXml).toContain('w:author="Reviewer"');
            expect(commentsXml).toContain('This is a comment');
        });
    });

    describe('DOCX Structure', () => {
        it('should create valid DOCX ZIP structure', async () => {
            const content = {
                type: 'doc',
                content: [
                    {
                        type: 'paragraph',
                        content: [{ type: 'text', text: 'Test' }]
                    }
                ]
            };

            const blob = await writer.export(content);
            const zip = await JSZip.loadAsync(blob);

            // Check required files exist
            expect(zip.file('[Content_Types].xml')).toBeTruthy();
            expect(zip.file('_rels/.rels')).toBeTruthy();
            expect(zip.file('word/document.xml')).toBeTruthy();
            expect(zip.file('word/_rels/document.xml.rels')).toBeTruthy();
        });

        it('should produce valid XML in document.xml', async () => {
            const content = {
                type: 'doc',
                content: [
                    {
                        type: 'paragraph',
                        content: [{ type: 'text', text: 'Test' }]
                    }
                ]
            };

            const blob = await writer.export(content);
            const zip = await JSZip.loadAsync(blob);
            const documentXml = await zip.file('word/document.xml')?.async('string');

            // Check XML declaration and namespace
            expect(documentXml).toContain('<?xml version="1.0" encoding="UTF-8"');
            expect(documentXml).toContain('xmlns:w=');
        });
    });

    describe('XML Escaping', () => {
        it('should escape special characters in text', async () => {
            const content = {
                type: 'doc',
                content: [
                    {
                        type: 'paragraph',
                        content: [{ type: 'text', text: '<script>alert("XSS")</script>' }]
                    }
                ]
            };

            const blob = await writer.export(content);
            const zip = await JSZip.loadAsync(blob);
            const documentXml = await zip.file('word/document.xml')?.async('string');

            expect(documentXml).not.toContain('<script>');
            expect(documentXml).toContain('&lt;script&gt;');
        });

        it('should escape ampersands', async () => {
            const content = {
                type: 'doc',
                content: [
                    {
                        type: 'paragraph',
                        content: [{ type: 'text', text: 'Tom & Jerry' }]
                    }
                ]
            };

            const blob = await writer.export(content);
            const zip = await JSZip.loadAsync(blob);
            const documentXml = await zip.file('word/document.xml')?.async('string');

            expect(documentXml).toContain('Tom &amp; Jerry');
        });
    });
});
