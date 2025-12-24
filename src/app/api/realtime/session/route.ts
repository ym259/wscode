import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/realtime/session
 * 
 * Creates an ephemeral session token for OpenAI Realtime API.
 * This token is used for WebRTC peer connection to enable voice communication.
 */
export async function POST(req: NextRequest) {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
        console.error('[API/Realtime Session] OPENAI_API_KEY is missing');
        return NextResponse.json(
            { error: 'Server misconfiguration: API Key missing' },
            { status: 500 }
        );
    }

    try {
        // Parse request body for optional configuration
        const body = await req.json().catch(() => ({}));
        const { instructions, tools } = body;

        // Request ephemeral token from OpenAI
        const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gpt-4o-realtime-preview-2024-12-17',
                voice: 'verse',
                instructions: instructions || getDefaultInstructions(),
                tools: tools || getDefaultTools(),
                input_audio_transcription: {
                    model: 'whisper-1'
                },
                turn_detection: {
                    type: 'server_vad',
                    threshold: 0.5,
                    prefix_padding_ms: 300,
                    silence_duration_ms: 500,
                },
            }),
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error('[API/Realtime Session] OpenAI error:', response.status, errorData);
            return NextResponse.json(
                { error: `Failed to create session: ${response.statusText}` },
                { status: response.status }
            );
        }

        const sessionData = await response.json();
        console.log('[API/Realtime Session] Session created successfully');

        return NextResponse.json(sessionData);

    } catch (error) {
        console.error('[API/Realtime Session] Error:', error);
        return NextResponse.json(
            { error: 'Failed to create realtime session' },
            { status: 500 }
        );
    }
}

/**
 * Default instructions for the voice agent
 */
function getDefaultInstructions(): string {
    return `You are a voice interface for an advanced document editor AI. Your primary role is to listen to the user's request and DELEGATE it to the text-based agent.

## Your Role

You act as the "ears" and "voice" of the system. You do NOT perform edits or searches yourself. Instead, you forward the user's intent to the advanced text agent which handles all reasoning, searching, and editing.

## Execution Workflow

1.  **Listen**: Understand the user's request.
2.  **Delegate**: Call the \`askAgent\` tool with the user's request.
3.  **Speak**: When \`askAgent\` returns the response, speak it back to the user naturally.

## Critical Rules

- **LANGUAGE PRESERVATION**: You MUST pass the user's request to \`askAgent\` in the **ORIGINAL LANGUAGE** (e.g., Japanese). Do NOT translate the request into English before calling the tool.
    - Incorrect: "Check for page number or article number errors" (Translation)
    - Correct: "条番号がおかしいところがあったら直して" (Original)
- **ALWAYS** use \`askAgent\` for any document interaction (reading, editing, searching, summarizing).
- **NEVER** try to hallucinate that you did something. Wait for \`askAgent\` to return the result.
- **Be Concise**: When successful, briefly summarize what the agent did.`;
}

/**
 * Default tools for document editing
 * These match the tools available in the text chat agent
 */
function getDefaultTools(): Array<{
    type: 'function';
    name: string;
    description: string;
    parameters: Record<string, unknown>;
}> {
    return [
        {
            type: 'function',
            name: 'askAgent',
            description: 'Delegate a request to the advanced text-based agent. Use this for ALL document operations (edit, search, read, summarize).',
            parameters: {
                type: 'object',
                properties: {
                    request: {
                        type: 'string',
                        description: 'The user\'s request. MUST be the verbatim transcript in the original language (e.g., Japanese, Spanish). Do not translate.',
                    }
                },
                required: ['request'],
                additionalProperties: false
            }
        }
    ];
}
