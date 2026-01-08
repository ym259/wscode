import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs'; // Need Node.js for file operations

/**
 * POST /api/image/upload
 * 
 * Uploads an image file to OpenAI's Files API for use in Responses API.
 * 
 * Body: { imageBase64: string, filename: string }
 * Returns: { file_id: string, metadata: { filename, bytes, created_at } }
 */
export async function POST(req: NextRequest) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error('[API/Image Upload] OPENAI_API_KEY is missing');
        return NextResponse.json({ error: 'Server misconfiguration: API Key missing' }, { status: 500 });
    }

    try {
        const { imageBase64, filename } = await req.json();

        if (!imageBase64 || !filename) {
            return NextResponse.json({ error: 'imageBase64 and filename are required' }, { status: 400 });
        }

        console.log('[API/Image Upload] Uploading Image:', filename);


        // Create a Blob/File for the OpenAI SDK
        // Detect mime type from base64 header if present, otherwise default to png
        let type = 'image/png';
        if (imageBase64.startsWith('data:image/jpeg')) type = 'image/jpeg';
        else if (imageBase64.startsWith('data:image/webp')) type = 'image/webp';

        // Strip data URL prefix if present for the buffer (Buffer.from might handle it but safer to be clean)
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
        const dataBuffer = Buffer.from(base64Data, 'base64');

        const blob = new Blob([dataBuffer], { type });
        const file = new File([blob], filename, { type });

        // Upload to OpenAI Files API
        const OpenAI = (await import('openai')).default;
        const openai = new OpenAI({ apiKey });

        const uploadedFile = await openai.files.create({
            file,
            purpose: 'vision',
        });

        console.log('[API/Image Upload] Success:', uploadedFile.id);

        return NextResponse.json({
            file_id: uploadedFile.id,
            metadata: {
                filename: uploadedFile.filename,
                bytes: uploadedFile.bytes,
                created_at: uploadedFile.created_at,
            }
        });
    } catch (error) {
        console.error('[API/Image Upload] Error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: `Failed to upload image: ${message}` }, { status: 500 });
    }
}
