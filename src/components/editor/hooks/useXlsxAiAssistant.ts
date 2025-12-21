
import { useEffect, useRef, useState, useCallback } from 'react';
import { AgentEvent, FileSystemItem, ChatMessage } from '@/types';
import { ToolContext, createTool } from '@/tools/types';
import { getNavigationTools } from '@/tools/navigation';
import { getContentTools } from '@/tools/content';
import { SetCellValueFn } from './useFortuneSheet';

/**
 * Hook to provide AI capabilities for XLSX editor.
 * Adapted from useAiAssistant but for Spreadsheet context (no SuperDoc).
 */
export function useXlsxAiAssistant(
    isReady: boolean,
    setAIActionHandler: (handler: any) => void,
    workspaceFiles?: FileSystemItem[],
    activeFilePath?: string,
    activeFileHandle?: FileSystemFileHandle,
    setCellValueCallback?: SetCellValueFn
) {

    // Handler for AI actions
    const handleAiAction = useCallback(async (
        prompt: string,
        history: ChatMessage[],
        onUpdate: (event: AgentEvent) => void
    ) => {
        if (!isReady) {
            console.warn('Xlsx editor is not ready.');
            return;
        }

        try {
            // Build tools list
            // We use a mock context since we don't have SuperDoc
            const context: ToolContext = {
                getActionMethods: () => ({} as any), // Mock actions
                getEditor: () => ({} as any),       // Mock editor
                workspaceFiles,
                activeFilePath,
                activeFileHandle,
                superdoc: {} as any,                // Mock superdoc
                setCellValue: setCellValueCallback  // Live cell update callback
            };

            // Get relevant tools
            const navTools = getNavigationTools(context);
            const contentTools = getContentTools(context);

            // Filter for only spreadsheet-supported tools
            // readDocument (legacy) might fail if it depends on superdoc, but readFile works (disk)
            // editSpreadsheet works as it uses disk.
            const supportedTools = [
                ...navTools.filter(t => ['readFile', 'readDirectory'].includes(t.function.name)),
                ...contentTools.filter(t => ['editSpreadsheet'].includes(t.function.name))
            ];

            const tools = supportedTools.map(t => ({ type: t.type, function: t.function }));

            const OpenAI = (await import('openai')).default;

            const client = new OpenAI({
                apiKey: 'dummy',
                baseURL: window.location.origin + '/api/ai',
                dangerouslyAllowBrowser: true
            });

            console.log('[XlsxAiAssistant] handleAiAction called.');

            // Build simpler context
            const activeDocContext = activeFilePath ? `\n\n# Current Context\nActive File: "${activeFilePath}"\n` : '';

            const messages: any[] = [
                {
                    type: 'message',
                    role: 'system',
                    content: `You are an intelligent spreadsheet editor agent. You can read and modify Excel files safely.${activeDocContext}
                    
# Capabilities
- Read file contents using \`readFile\`
- Edit spreadsheets using \`editSpreadsheet\` (specify sheet, cell, value)

# Strategy
- To edit, you must know the cell address (e.g., "E7").
- If the user asks to "write 7 in E7", use \`editSpreadsheet\`.
- If you need to see the content first, use \`readFile\`.
`
                },
                ...history.flatMap(msg => {
                    const items: any[] = [];
                    // Adapt to Responses API format (same as useAiAssistant)
                    if (msg.role === 'user') {
                        items.push({ type: 'message', role: 'user', content: msg.content || '' });
                    } else if (msg.role === 'assistant') {
                        if (msg.content) {
                            items.push({ type: 'message', role: 'assistant', content: msg.content });
                        }
                        if (msg.toolCalls?.length) {
                            for (const tc of msg.toolCalls) {
                                items.push({
                                    type: 'function_call',
                                    call_id: tc.id,
                                    name: tc.name,
                                    arguments: JSON.stringify(tc.args || {})
                                });
                                items.push({
                                    type: 'function_call_output',
                                    call_id: tc.id,
                                    output: typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result || 'Done')
                                });
                            }
                        }
                    } else if (msg.role === 'system') {
                        items.push({ type: 'message', role: 'system', content: msg.content || '' });
                    }
                    return items;
                }),
                { type: 'message', role: 'user', content: prompt }
            ];

            // ReAct Loop (Simplified reuse of useAiAssistant logic)
            let loopCount = 0;
            const MAX_LOOPS = 10;

            // Convert tools to Responses API format
            const responsesApiTools = tools.map((t: any) => ({
                type: 'function' as const,
                name: t.function.name,
                description: t.function.description,
                parameters: t.function.parameters,
                strict: false
            }));

            while (loopCount < MAX_LOOPS) {
                loopCount++;

                const stream = await client.responses.create({
                    model: 'gpt-5-mini',
                    input: messages as any,
                    tools: responsesApiTools,
                    stream: true,
                    reasoning: { summary: 'auto', effort: "low" },
                });

                let finalContent = '';
                let toolCallsMap: Record<string, { id: string, name: string, args: string }> = {};

                for await (const event of stream) {
                    if (event.type === 'response.reasoning_summary_text.delta') {
                        onUpdate({ type: 'reasoning_delta', content: (event as any).delta || '', timestamp: Date.now() });
                    }
                    if (event.type === 'response.output_text.delta') {
                        const delta = (event as any).delta || '';
                        finalContent += delta;
                        onUpdate({ type: 'content_delta', content: delta, timestamp: Date.now() });
                    }
                    // Handle function calls (Simplified logic)
                    if (event.type === 'response.output_item.added' && (event as any).item.type === 'function_call') {
                        const item = (event as any).item;
                        const callId = item.call_id || item.id;
                        toolCallsMap[callId] = { id: callId, name: item.name || '', args: item.arguments || '' };
                        onUpdate({ type: 'tool_start', id: callId, name: item.name || '', args: {}, timestamp: Date.now() });
                    }
                    // Handle function call done event - contains complete arguments
                    if (event.type === 'response.output_item.done') {
                        const item = (event as any).item || event;
                        console.log('[XlsxAiAssistant] function call done:', JSON.stringify(item));
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

                    // Accumulate function call arguments (streaming)
                    if (event.type === 'response.function_call_arguments.delta') {
                        const callId = (event as any).call_id || (event as any).item_id;
                        const argsDelta = (event as any).delta || '';
                        console.log('[XlsxAiAssistant] function_call_arguments.delta:', callId, argsDelta);
                        if (callId && toolCallsMap[callId]) {
                            toolCallsMap[callId].args += argsDelta;
                        }
                    }
                    // Handle arguments done
                    if (event.type === 'response.function_call_arguments.done') {
                        const callId = (event as any).call_id || (event as any).item_id;
                        const args = (event as any).arguments || '';
                        console.log('[XlsxAiAssistant] function_call_arguments.done:', callId, args);
                        if (callId && toolCallsMap[callId]) {
                            toolCallsMap[callId].args = args;
                        }
                    }
                }

                if (finalContent) {
                    messages.push({ type: 'message', role: 'assistant', content: finalContent });
                }

                const completedToolCalls = Object.values(toolCallsMap);
                if (completedToolCalls.length === 0) {
                    onUpdate({ type: 'run_completed', timestamp: Date.now() });
                    break;
                } else {
                    for (const tc of completedToolCalls) {
                        messages.push({ type: 'function_call', call_id: tc.id, name: tc.name, arguments: tc.args });
                        const toolDef = supportedTools.find(t => t.function.name === tc.name);
                        if (toolDef) {
                            try {
                                const args = JSON.parse(tc.args || '{}');
                                const result = await toolDef.execute(args);
                                onUpdate({ type: 'tool_result', id: tc.id, result, status: 'success', args, timestamp: Date.now() });
                                messages.push({ type: 'function_call_output', call_id: tc.id, output: String(result) });
                            } catch (error) {
                                onUpdate({ type: 'tool_result', id: tc.id, result: String(error), status: 'failure', timestamp: Date.now() });
                                messages.push({ type: 'function_call_output', call_id: tc.id, output: 'Error: ' + String(error) });
                            }
                        }
                    }
                }
            }
            onUpdate({ type: 'run_completed', timestamp: Date.now() });

        } catch (err) {
            console.error('[XlsxEditor] Agent Error:', err);
            onUpdate({ type: 'content_delta', content: '\n[Error: ' + String(err) + ']', timestamp: Date.now() });
            onUpdate({ type: 'run_completed', timestamp: Date.now() });
        }
    }, [isReady, workspaceFiles, activeFilePath]);

    // Register handler
    useEffect(() => {
        if (isReady) {
            setAIActionHandler(handleAiAction);
        } else {
            setAIActionHandler(null);
        }
        return () => setAIActionHandler(null);
    }, [isReady, handleAiAction, setAIActionHandler]);

}
