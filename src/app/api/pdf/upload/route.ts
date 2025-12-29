import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs'; // Need Node.js for file operations

/**
 * POST /api/pdf/upload
 * 
 * Uploads a PDF file to OpenAI's Files API for use in Responses API.
 * 
 * Body: { pdfBase64: string, filename: string }
 * Returns: { file_id: string, metadata: { filename, bytes, created_at } }
 */
export async function POST(req: NextRequest) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error('[API/PDF Upload] OPENAI_API_KEY is missing');
        return NextResponse.json({ error: 'Server misconfiguration: API Key missing' }, { status: 500 });
    }

    try {
        const { pdfBase64, filename } = await req.json();

        if (!pdfBase64 || !filename) {
            return NextResponse.json({ error: 'pdfBase64 and filename are required' }, { status: 400 });
        }

        console.log('[API/PDF Upload] Uploading PDF:', filename);

        // Convert base64 to buffer
        const buffer = Buffer.from(pdfBase64, 'base64');

        // Create a Blob/File for the OpenAI SDK
        const blob = new Blob([buffer], { type: 'application/pdf' });
        const file = new File([blob], filename, { type: 'application/pdf' });

        // Upload to OpenAI Files API
        const OpenAI = (await import('openai')).default;
        const openai = new OpenAI({ apiKey });

        const uploadedFile = await openai.files.create({
            file,
            purpose: 'user_data',
        });

        console.log('[API/PDF Upload] Success:', uploadedFile.id);

        return NextResponse.json({
            file_id: uploadedFile.id,
            metadata: {
                filename: uploadedFile.filename,
                bytes: uploadedFile.bytes,
                created_at: uploadedFile.created_at,
            }
        });
    } catch (error) {
        console.error('[API/PDF Upload] Error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: `Failed to upload PDF: ${message}` }, { status: 500 });
    }
}
