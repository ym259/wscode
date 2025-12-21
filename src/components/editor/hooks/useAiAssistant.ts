import { useEffect, useRef, useState, useCallback, RefObject } from 'react';
import { SuperDoc } from '@harbour-enterprises/superdoc';
import { AIActions, createAIProvider } from '@superdoc-dev/ai';
import { ChatMessage, AgentEvent, FileSystemItem } from '@/types';
import { getToolDefinitions } from '../utils/ai-tools';

export function useAiAssistant(
    superdocRef: RefObject<SuperDoc | null>,
    isReady: boolean,
    setAIActionHandler: (handler: any) => void,
    workspaceFiles?: FileSystemItem[],
    activeFilePath?: string
) {

    const aiActionsRef = useRef<AIActions | null>(null);
    const [isAiInitialized, setIsAiInitialized] = useState(false);

    // Initialize AI Actions separately to ensure SuperDoc is ready
    useEffect(() => {
        if (!isReady || !superdocRef.current) {
            if (aiActionsRef.current) {
                console.log('[DocEditor] Clearing AIActions because isReady is false');
                aiActionsRef.current = null;
                setIsAiInitialized(false);
            }
            return;
        }

        if (aiActionsRef.current) return;

        console.log('[DocEditor] Initializing AIActions for Tool Access...');
        const provider = createAIProvider({
            type: 'http',
            url: '/api/ai',
            headers: { 'Content-Type': 'application/json' },
            parseCompletion: (p) => (p as any)?.content || ''
        });

        try {
            aiActionsRef.current = new AIActions(superdocRef.current as any, {
                user: { displayName: 'AI Assistant', userId: 'ai-assistant' },
                provider,
                enableLogging: true,
            });
            console.log('[DocEditor] AIActions initialized successfully');
            setIsAiInitialized(true);
        } catch (err) {
            console.error('[DocEditor] Failed to initialize AI Actions:', err);
            setIsAiInitialized(false);
        }
    }, [isReady, superdocRef]);

    // Handler for AI actions
    const handleAiAction = useCallback(async (
        prompt: string,
        history: ChatMessage[],
        onUpdate: (event: AgentEvent) => void
    ) => {
        if (!aiActionsRef.current || !superdocRef.current) {
            console.warn('Document editor is not ready.');
            return;
        }

        try {
            await aiActionsRef.current.waitUntilReady();

            // Note: We use the tool definitions from our utility, passing the current instances
            const toolDefinitions = getToolDefinitions(aiActionsRef.current, superdocRef.current, workspaceFiles, activeFilePath);
            const tools = toolDefinitions.map(t => ({ type: t.type, function: t.function }));

            const OpenAI = (await import('openai')).default;

            const client = new OpenAI({
                apiKey: 'dummy', // Injected by backend proxy
                baseURL: window.location.origin + '/api/ai',
                dangerouslyAllowBrowser: true
            });

            console.log('[DocEditor] handleAiAction called.');

            // Build dynamic context about active document with statistics
            let activeDocContext = '';
            if (activeFilePath && superdocRef.current) {
                const sd = superdocRef.current as any;
                const editor = sd.activeEditor || sd.editor || sd.getEditor?.() || sd._editor;

                // Get document statistics
                let charCount = 0;
                let blockCount = 0;
                const CHARS_PER_PAGE = 3000; // Approximate chars per page

                try {
                    // Get character count from document text content
                    if (editor?.state?.doc) {
                        charCount = editor.state.doc.textContent?.length || 0;
                    }

                    // Get block count
                    if (editor?.helpers?.blockNode?.getBlockNodes) {
                        const blocks = editor.helpers.blockNode.getBlockNodes();
                        blockCount = blocks.length;
                    }
                } catch (e) {
                    console.warn('[useAiAssistant] Error getting doc stats:', e);
                }

                const estimatedPages = Math.ceil(charCount / CHARS_PER_PAGE) || 1;
                const isLargeDoc = estimatedPages > 5;

                activeDocContext = `\n\n# Current Context
Document: "${activeFilePath}"
- Character count: ${charCount.toLocaleString()}
- Estimated pages: ${estimatedPages}
- Block count: ${blockCount}

${isLargeDoc
                        ? `**Strategy Hint**: This is a large document (>${estimatedPages} pages). Use \`searchDocument\` to find specific content first, then \`readDocument({ startIndex, endIndex })\` to read around matches. Avoid reading the entire document at once.`
                        : `**Strategy Hint**: This is a small document (≤5 pages). You can use \`readDocument()\` to read the full content for comprehensive understanding.`
                    }

When the user refers to "this document", "the document", or makes requests without specifying a file, they mean this active document.`;
            }

            const messages: any[] = [
                {
                    type: 'message',
                    role: 'system',
                    content: `You are an intelligent professional document editor agent. Edit documents safely while preserving structure and formatting.${activeDocContext}

# Tool Selection Strategy

## When to use \`searchDocument\` (faster, more efficient):
- Finding and replacing specific text or phrases
- Locating where a term, clause, or keyword appears
- Quick lookups without needing full document understanding
- Checking if specific content exists in the document

## When to use \`readDocument\` (comprehensive understanding):
- Rephrasing, rewriting, or summarizing sections
- Understanding document structure or context
- Deleting or moving blocks (requires \`sdBlockId\`)
- Making changes that depend on surrounding content
- First-time document exploration

**Default behavior**: For targeted edits (replace X with Y), prefer \`searchDocument\` first. For broader edits (rewrite, summarize, restructure), use \`readDocument\`.

# Critical Rules

## Deletion
- ALWAYS call \`readDocument\` first to obtain \`sdBlockId\`
- Delete ONLY using \`deleteBlock(blockId)\` — never use \`literalReplace\` for deletions

## List Operations
- After inserting/deleting list items, ALWAYS call \`fixOrderedListNumbering\`

## Formatting
- **Primary tool: \`editText\`** - Use for all text replacement and common formatting:
  - Replace + style: \`editText({ find: "**bold**", replace: "bold", bold: true })\`
  - Style only: \`editText({ find: "Title", headingLevel: 1 })\`
  - Supports: \`headingLevel\`, \`bold\`, \`italic\`, \`underline\`, \`strikethrough\`, \`code\`
- **Advanced formatting** (font size, alignment, line height): Use \`selectText\` first, then apply the specific tool

## Tables
- Use \`afterText\` parameter to anchor table placement

## Reading & Large Document Strategy
- For small documents (≤5 pages): Use \`readDocument()\` for full content
- For large documents (>5 pages):
  1. Use \`searchDocument\` to find relevant sections first
  2. Use \`readDocument({ startIndex, endIndex })\` to read around search results
  3. Each block is roughly a paragraph/heading/list item (~100-200 chars)
- Use \`readDocument({ includeStyles: true })\` for style validation

## Bulk Operations
- When replacing/fixing syles/updating many parts in document, execute the tools in parallel as much as possible.

# Constraints
- Preserve indentation, spacing, list structure, heading hierarchy
- Remove orphaned blank lines after deletions
- Verify changes before completing`
                },
                ...history.flatMap(msg => {
                    const items: any[] = [];

                    const truncateToolOutput = (content: string, maxLength: number = 1000) => {
                        if (content.length <= maxLength) return content;
                        return content.substring(0, maxLength) + `... [Output truncated, length: ${content.length}]`;
                    };

                    // For Responses API, we use different item types
                    if (msg.role === 'user') {
                        items.push({
                            type: 'message',
                            role: 'user',
                            content: msg.content || ''
                        });
                    } else if (msg.role === 'assistant') {
                        // Add assistant message content if present
                        if (msg.content) {
                            items.push({
                                type: 'message',
                                role: 'assistant',
                                content: msg.content
                            });
                        }

                        // Add function calls as separate items
                        if (msg.toolCalls && msg.toolCalls.length > 0) {
                            for (const tc of msg.toolCalls) {
                                // Add the function call item
                                items.push({
                                    type: 'function_call',
                                    call_id: tc.id,
                                    name: tc.name,
                                    arguments: JSON.stringify(tc.args || {})
                                });

                                // Add the function output item
                                const rawResult = typeof tc.result === 'string'
                                    ? tc.result
                                    : JSON.stringify(tc.result !== undefined ? tc.result : 'Done');

                                items.push({
                                    type: 'function_call_output',
                                    call_id: tc.id,
                                    output: truncateToolOutput(rawResult)
                                });
                            }
                        }
                    } else if (msg.role === 'system') {
                        items.push({
                            type: 'message',
                            role: 'system',
                            content: msg.content || ''
                        });
                    }

                    return items;
                }),
                { type: 'message', role: 'user', content: prompt }
            ];

            // Custom ReAct-like Loop with Streaming using Responses API
            let loopCount = 0;
            const MAX_LOOPS = 50;

            // Convert tools to Responses API format
            const responsesApiTools = tools.map((t: any) => ({
                type: 'function' as const,
                name: t.function.name,
                description: t.function.description,
                parameters: t.function.parameters,
                strict: false // Allow optional parameters in tool schemas
            }));

            while (loopCount < MAX_LOOPS) {
                loopCount++;

                // Use Responses API with reasoning support
                const stream = await client.responses.create({
                    model: 'gpt-5-mini',
                    input: messages as any,
                    tools: responsesApiTools,
                    parallel_tool_calls: true,
                    stream: true,
                    reasoning: { summary: 'auto', effort: "low" }, // Enable reasoning summaries
                });

                let finalContent = '';
                let toolCallsMap: Record<string, { id: string, name: string, args: string }> = {};

                for await (const event of stream) {
                    // Handle reasoning summary deltas
                    if (event.type === 'response.reasoning_summary_text.delta') {
                        onUpdate({
                            type: 'reasoning_delta',
                            content: (event as any).delta || '',
                            timestamp: Date.now()
                        });
                    }

                    // Handle output text deltas (content)
                    if (event.type === 'response.output_text.delta') {
                        const delta = (event as any).delta || '';
                        finalContent += delta;
                        onUpdate({
                            type: 'content_delta',
                            content: delta,
                            timestamp: Date.now()
                        });
                    }

                    // Handle function calls - check multiple event types
                    if (event.type === 'response.output_item.added') {
                        const item = (event as any).item;
                        console.log('[Responses API] output_item.added:', JSON.stringify(item));
                        if (item?.type === 'function_call') {
                            const callId = item.call_id || item.id || `call_${Date.now()}`;
                            toolCallsMap[callId] = {
                                id: callId,
                                name: item.name || '',
                                args: item.arguments || ''  // Arguments might be included directly
                            };
                            onUpdate({
                                type: 'tool_start',
                                id: callId,
                                name: item.name || '',
                                args: {},
                                timestamp: Date.now()
                            });
                        }
                    }

                    // Handle function call done event - might contain full arguments
                    if (event.type === 'response.output_item.done') {
                        const item = (event as any).item || event;
                        console.log('[Responses API] function call done:', JSON.stringify(item));
                        if (item?.type === 'function_call' || (event as any).call_id) {
                            const callId = item.call_id || (event as any).call_id || item.id;
                            if (callId) {
                                if (!toolCallsMap[callId]) {
                                    toolCallsMap[callId] = {
                                        id: callId,
                                        name: item.name || '',
                                        args: ''
                                    };
                                }
                                // Update with full arguments if present
                                if (item.arguments) {
                                    toolCallsMap[callId].args = item.arguments;
                                }
                                if (item.name && !toolCallsMap[callId].name) {
                                    toolCallsMap[callId].name = item.name;
                                }
                            }
                        }
                    }

                    // Accumulate function call arguments
                    if (event.type === 'response.function_call_arguments.delta') {
                        const callId = (event as any).call_id || (event as any).item_id;
                        const argsDelta = (event as any).delta || '';
                        console.log('[Responses API] function_call_arguments.delta:', callId, argsDelta);
                        if (callId && toolCallsMap[callId]) {
                            toolCallsMap[callId].args += argsDelta;
                        }
                    }

                    // Handle arguments done
                    if (event.type === 'response.function_call_arguments.done') {
                        const callId = (event as any).call_id || (event as any).item_id;
                        const args = (event as any).arguments || '';
                        console.log('[Responses API] function_call_arguments.done:', callId, args);
                        if (callId && toolCallsMap[callId]) {
                            toolCallsMap[callId].args = args;
                        }
                    }
                }

                console.log('[Responses API] Loop complete, toolCallsMap:', JSON.stringify(toolCallsMap));

                // For Responses API: add assistant content as message item
                if (finalContent) {
                    messages.push({
                        type: 'message',
                        role: 'assistant',
                        content: finalContent
                    });
                }

                const completedToolCalls = Object.values(toolCallsMap);

                if (completedToolCalls.length === 0) {
                    onUpdate({ type: 'run_completed', timestamp: Date.now() });
                    break;
                } else {
                    for (const tc of completedToolCalls) {
                        // Add function_call item
                        messages.push({
                            type: 'function_call',
                            call_id: tc.id,
                            name: tc.name,
                            arguments: tc.args
                        });

                        const toolDef = toolDefinitions.find(t => t.function.name === tc.name);
                        if (toolDef) {
                            try {
                                const args = JSON.parse(tc.args || '{}');

                                const result = await toolDef.execute(args);

                                onUpdate({
                                    type: 'tool_result',
                                    id: tc.id,
                                    result: result,
                                    status: 'success',
                                    args: args,
                                    timestamp: Date.now()
                                });

                                // Add function_call_output item
                                messages.push({
                                    type: 'function_call_output',
                                    call_id: tc.id,
                                    output: typeof result === 'string' ? result : JSON.stringify(result)
                                });
                            } catch (error) {
                                onUpdate({
                                    type: 'tool_result',
                                    id: tc.id,
                                    result: String(error),
                                    status: 'failure',
                                    timestamp: Date.now()
                                });
                                // Add function_call_output item with error
                                messages.push({
                                    type: 'function_call_output',
                                    call_id: tc.id,
                                    output: 'Error: ' + String(error)
                                });
                            }
                        }
                    }
                }
            }

            // Always ensure run_completed is sent when the loop finishes normally
            onUpdate({ type: 'run_completed', timestamp: Date.now() });
        } catch (err) {
            console.error('[DocEditor] Agent Error:', err);
            onUpdate({
                type: 'content_delta',
                content: '\n\n[Error: ' + (err instanceof Error ? err.message : 'Unknown error') + ']',
                timestamp: Date.now()
            });
            onUpdate({ type: 'run_completed', timestamp: Date.now() });
        }
    }, [superdocRef]);

    // Register the AI action handler with context
    useEffect(() => {
        if (isAiInitialized && aiActionsRef.current) {
            console.log('[DocEditor] Registering AI handler (AI initialized)');
            setAIActionHandler(handleAiAction);
        } else {
            console.log('[DocEditor] AI not ready yet');
            setAIActionHandler(null);
        }

        return () => {
            console.log('[DocEditor] Cleanup: Unregistering AI handler');
            setAIActionHandler(null);
        };
    }, [isAiInitialized, handleAiAction, setAIActionHandler]);

    return { isAiInitialized };
}
