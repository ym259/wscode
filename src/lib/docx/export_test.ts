import { DocxReader } from './DocxReader';
import { DocxWriter } from './DocxWriter';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import JSZip from 'jszip';

/**
 * This script exports the sample DOCX and saves it for manual verification.
 * Run with: npx tsx src/lib/docx/export_test.ts
 */
async function main() {
    console.log('Loading sample DOCX...');

    const samplePath = join(process.cwd(), 'public', 'ソフトウェア開発及び保守運用業務委託契約書（案）0807.docx');
    const sampleBuffer = readFileSync(samplePath);

    // Parse original
    console.log('Parsing with DocxReader...');
    const reader = new DocxReader();
    const parsedContent = await reader.load(sampleBuffer);

    console.log('Parsed content nodes:', parsedContent.content?.length);

    // Export with DocxWriter
    console.log('Exporting with DocxWriter...');
    const writer = new DocxWriter();
    const exportedBlob = await writer.export(parsedContent);

    // Convert blob to buffer
    const arrayBuffer = await exportedBlob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Save to file
    const outputPath = join(process.cwd(), 'public', 'exported_test.docx');
    writeFileSync(outputPath, buffer);
    console.log(`Exported to: ${outputPath}`);

    // Also dump the numbering.xml for inspection
    const zip = await JSZip.loadAsync(buffer);
    const numberingXml = await zip.file('word/numbering.xml')?.async('string');
    if (numberingXml) {
        const numberingPath = join(process.cwd(), 'public', 'exported_numbering.xml');
        writeFileSync(numberingPath, numberingXml);
        console.log(`Numbering XML saved to: ${numberingPath}`);
    }

    console.log('Done!');
}

main().catch(console.error);
