import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(req: NextRequest, props: { params: Promise<{ path?: string[] }> }) {
    const params = await props.params;
    const { path: pathSegments } = params;
    const path = pathSegments ? pathSegments.join('/') : '';

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error('[API/AI Proxy] OPENAI_API_KEY is missing');
        return NextResponse.json({ error: 'Server misconfiguration: API Key missing' }, { status: 500 });
    }

    try {

        // If no path is provided, this is a SuperDoc AI direct request
        if (!path) {
            const body = await req.json();
            console.log('[API/AI] Handling SuperDoc AI direct request');
            const { messages, prompt, context } = body;

            // SuperDoc sends messages array, simple UI sends prompt
            let apiMessages = [];
            if (messages && Array.isArray(messages) && messages.length > 0) {
                apiMessages = messages;
            } else if (prompt) {
                const systemPrompt = `You are an intelligent writing assistant embedded in a document editor.
Your task is to help the user edit, write, or improve their document.

Context from the document:
${context || 'No context provided.'}`;
                apiMessages = [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: prompt }
                ];
            } else {
                return NextResponse.json({ error: 'No messages or prompt provided' }, { status: 400 });
            }

            // Make OpenAI chat completion request
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: body.model || 'gpt-4.1-mini',
                    messages: apiMessages,
                    ...body.temperature && { temperature: body.temperature },
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                // console.error('[API/AI] OpenAI error:', errorText);
                return NextResponse.json({ error: errorText }, { status: response.status });
            }

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content || '';
            return NextResponse.json({ content });
        }

        // For path-based requests, proxy directly to OpenAI
        const url = `https://api.openai.com/v1/${path}`;
        console.log('[API/AI Proxy] Forwarding POST request to:', url);

        const contentType = req.headers.get('content-type') || '';
        let body: BodyInit | null = null;
        const headers: Record<string, string> = {
            'Authorization': `Bearer ${apiKey}`,
        };

        if (contentType.includes('multipart/form-data')) {
            // Forward raw body and content-type (boundary is crucial)
            body = req.body;
            headers['Content-Type'] = contentType;
        } else {
            const jsonBody = await req.json();
            body = JSON.stringify(jsonBody);
            headers['Content-Type'] = 'application/json';
        }

        const upstreamResponse = await fetch(url, {
            method: 'POST',
            headers,
            body,
        });

        return new NextResponse(upstreamResponse.body, {
            status: upstreamResponse.status,
            statusText: upstreamResponse.statusText,
            headers: upstreamResponse.headers,
        });

    } catch (error) {
        console.error('[API/AI Proxy] Error:', error);
        return NextResponse.json({ error: 'Failed to process AI request' }, { status: 500 });
    }
}
