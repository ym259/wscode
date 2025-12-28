import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import { DocxReader } from '../src/lib/docx/DocxReader';
import { DocxWriter } from '../src/lib/docx/DocxWriter';

// Polyfill Blob for JSZip in Node environment
import { Blob } from 'buffer';
// @ts-expect-error polyfill for Blob
global.Blob = Blob;

describe('Verify header/footer fix', () => {
    it('should preserve header/footer references after roundtrip', async () => {
        const inputPath = path.join(process.cwd(), 'public/sample-docs/（サンプル）相手方準備書面.docx');

        const buffer = fs.readFileSync(inputPath);
        const zip = await JSZip.loadAsync(buffer);
        const origDoc = await zip.file('word/document.xml')?.async('string');

        // DO A ROUNDTRIP
        const reader = new DocxReader();
        const content = await reader.loadFromZip(zip);
        const writer = new DocxWriter(zip);
        const blob = await writer.export(content);

        const arrayBuffer = await blob.arrayBuffer();
        const outputBuffer = Buffer.from(arrayBuffer);
        const outputZip = await JSZip.loadAsync(outputBuffer);
        const outputDoc = await outputZip.file('word/document.xml')?.async('string');

        const extractSectPr = (doc: string) => {
            const match = doc.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/);
            return match?.[0] || 'none';
        };

        const origSect = extractSectPr(origDoc!);
        const newSect = extractSectPr(outputDoc!);

        console.log('=== Original sectPr ===');
        console.log(origSect);

        console.log('\n=== Exported sectPr ===');
        console.log(newSect);

        // Check specifically for footerReference
        const hasFooter = (s: string) => s.includes('w:footerReference');
        console.log('\nOriginal has footerReference:', hasFooter(origSect));
        console.log('Exported has footerReference:', hasFooter(newSect));

        expect(hasFooter(newSect)).toBe(hasFooter(origSect));

        // Check if IDs are preserved
        const extractId = (s: string) => {
            const match = s.match(/r:id="([^"]+)"/);
            return match?.[1];
        };

        console.log('Original footer r:id:', extractId(origSect));
        console.log('Exported footer r:id:', extractId(newSect));
        expect(extractId(newSect)).toBe(extractId(origSect));
    });
});
