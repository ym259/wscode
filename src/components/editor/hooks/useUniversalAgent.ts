/**
 * Universal Agent Hook
 * 
 * Unified AI agent that handles all file types (DOCX, XLSX, etc.)
 * with dynamic tool loading based on active file type.
 * 
 * Supports both SuperDoc (main app) and CustomDocEditor (editorv2).
 * 
 * @module components/editor/hooks/useUniversalAgent
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { AIActions, createAIProvider } from '@superdoc-dev/ai';
import { ChatMessage, AgentEvent } from '@/types';

import { UniversalAgentConfig } from './universal-agent/types';
import { detectFileType, buildToolContext } from './universal-agent/context';
import { getToolsForFileType } from './universal-agent/tools';
import { buildSystemPrompt } from './universal-agent/prompts';

// Re-export types for consumers
export type { UniversalAgentConfig, FileType } from './universal-agent/types';

/**
 * Universal Agent Hook
 * 
 * Handles all file types with dynamic tool loading.
 * Works with both SuperDoc (main app) and CustomDocEditor (editorv2).
 */
export function useUniversalAgent(config: UniversalAgentConfig) {
    const {
        superdocRef,
        customEditorRef,
        isReady,
        activeFilePath,
        activeFileHandle,
        workspaceFiles,
        setAIActionHandler,
        setVoiceToolHandler,
        setCellValue,
        openFileInEditor
    } = config;

    const activeFileType = config.activeFileType || detectFileType(activeFilePath);

    const aiActionsRef = useRef<AIActions | null>(null);
    const [isAiInitialized, setIsAiInitialized] = useState(false);

    // Determine which editor mode we're in
    const usingSuperDoc = !!superdocRef?.current;
    const usingCustomEditor = !!customEditorRef?.current;

    // Initialize AIActions for DOCX (only needed for SuperDoc integration)
    useEffect(() => {
        // Only initialize AIActions for SuperDoc-based DOCX editing
        if (!isReady || activeFileType !== 'docx' || !usingSuperDoc) {
            // If using custom editor for DOCX, we're ready without AIActions
            if (isReady && activeFileType === 'docx' && usingCustomEditor) {
                console.log('[UniversalAgent] Using CustomDocEditor, no AIActions needed');
                setIsAiInitialized(true);
                return;
            }

            // For non-docx files, we're ready without AIActions
            if (isReady && activeFileType && activeFileType !== 'docx') {
                setIsAiInitialized(true);
                return;
            }

            if (aiActionsRef.current) {
                console.log('[UniversalAgent] Clearing AIActions');
                aiActionsRef.current = null;
                setIsAiInitialized(false);
            }
            return;
        }

        if (aiActionsRef.current) return;

        console.log('[UniversalAgent] Initializing AIActions for SuperDoc...');

        // Debug: Log SuperDoc state before initialization
        const sd = superdocRef.current as any;
        const editorState = {
            hasActiveEditor: !!sd?.activeEditor,
            hasEditor: !!sd?.editor,
            hasGetEditor: typeof sd?.getEditor === 'function',
            has_editor: !!sd?._editor,
            superdocKeys: sd ? Object.keys(sd).filter(k => k.includes('editor') || k.includes('Editor')).slice(0, 10) : []
        };
        console.log('[UniversalAgent] SuperDoc editor state:', editorState);

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
            console.log('[UniversalAgent] AIActions initialized');
            setIsAiInitialized(true);
        } catch (err) {
            console.error('[UniversalAgent] Failed to initialize AIActions:', err);
            setIsAiInitialized(false);
        }
    }, [isReady, superdocRef, customEditorRef, activeFileType, usingSuperDoc, usingCustomEditor]);

    // Handler for AI actions
    const handleAiAction = useCallback(async (
        prompt: string,
        history: ChatMessage[],
        onUpdate: (event: AgentEvent) => void,
        images?: string[]
    ) => {
        if (!isReady) {
            console.warn('[UniversalAgent] Not ready.');
            return;
        }

        // For DOCX with SuperDoc, wait for AIActions
        if (activeFileType === 'docx' && usingSuperDoc && !aiActionsRef.current) {
            console.warn('[UniversalAgent] DOCX editor (SuperDoc) not ready.');
            return;
        }

        try {
            if (aiActionsRef.current) {
                await aiActionsRef.current.waitUntilReady();
            }

            // Build tool context
            const contextConfig: UniversalAgentConfig = {
                superdocRef,
                customEditorRef,
                isReady,
                activeFilePath,
                activeFileType,
                activeFileHandle,
                workspaceFiles,
                setAIActionHandler,
                setCellValue,
                openFileInEditor
            };
            const context = buildToolContext(contextConfig, aiActionsRef.current);

            // Get tools based on file type
            const toolDefinitions = getToolsForFileType(context, activeFileType);
            const tools = toolDefinitions.map(t => ({ type: t.type, function: t.function }));

            // Get document stats for DOCX
            let docStats: { charCount: number; blockCount: number; estimatedPages: number } | undefined;
            if (activeFileType === 'docx') {
                const editor = context.getEditor();
                const CHARS_PER_PAGE = 3000;
                let charCount = 0;
                let blockCount = 0;
                try {
                    if (editor?.state?.doc) {
                        charCount = editor.state.doc.textContent?.length || 0;
                    }
                    if (editor?.helpers?.blockNode?.getBlockNodes) {
                        blockCount = editor.helpers.blockNode.getBlockNodes().length;
                    }
                } catch (e) {
                    console.warn('[UniversalAgent] Error getting doc stats:', e);
                }
                docStats = { charCount, blockCount, estimatedPages: Math.ceil(charCount / CHARS_PER_PAGE) || 1 };
            }

            // Build system prompt
            const systemPrompt = buildSystemPrompt(contextConfig, docStats);

            console.log('[UniversalAgent] Context:', {
                activeFilePath,
                activeFileType,
                hasSuperdoc: usingSuperDoc,
                hasCustomEditor: usingCustomEditor,
                toolCount: toolDefinitions.length,
                toolNames: toolDefinitions.map(t => t.function.name)
            });
            console.log('[UniversalAgent] System prompt preview:', systemPrompt.substring(0, 500));

            // Initialize OpenAI client
            const OpenAI = (await import('openai')).default;
            const client = new OpenAI({
                apiKey: 'dummy',
                baseURL: window.location.origin + '/api/ai',
                dangerouslyAllowBrowser: true
            });

            console.log('[UniversalAgent] handleAiAction called, fileType:', activeFileType);

            // Truncate tool output helper - increased for long document handling
            const truncateToolOutput = (content: string, maxLength: number = 20000) => {
                if (content.length <= maxLength) return content;
                return content.substring(0, maxLength) + `... [Output truncated, length: ${content.length}]`;
            };

            // Build messages array
            const messages: any[] = [
                { type: 'message', role: 'system', content: systemPrompt },
                ...history.flatMap(msg => {
                    const items: any[] = [];
                    if (msg.role === 'user') {
                        if (msg.images && msg.images.length > 0) {
                            const content = [
                                { type: 'input_text', text: msg.content || '' },
                                ...msg.images.map(img => ({ type: 'input_image', image_url: img }))
                            ];
                            items.push({ type: 'message', role: 'user', content });
                        } else {
                            items.push({ type: 'message', role: 'user', content: msg.content || '' });
                        }
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
                                    output: truncateToolOutput(
                                        typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result ?? 'Done')
                                    )
                                });
                            }
                        }
                    } else if (msg.role === 'system') {
                        items.push({ type: 'message', role: 'system', content: msg.content || '' });
                    }
                    return items;
                }),
                {
                    type: 'message',
                    role: 'user',
                    content: (images && images.length > 0)
                        ? [
                            { type: 'input_text', text: prompt },
                            ...images.map(img => ({ type: 'input_image', image_url: img }))
                        ]
                        : prompt
                }
            ];

            // Convert tools to Responses API format
            const responsesApiTools = tools.map((t: any) => ({
                type: 'function' as const,
                name: t.function.name,
                description: t.function.description,
                parameters: t.function.parameters,
                strict: false
            }));

            // ReAct Loop - increased for comprehensive contract review tasks
            let loopCount = 0;
            const MAX_LOOPS = 200;

            let previousResponseId: string | undefined;

            while (loopCount < MAX_LOOPS) {
                loopCount++;

                const stream = await client.responses.create({
                    model: 'gpt-5-mini', // or whatever is used
                    input: messages as any,
                    tools: responsesApiTools,
                    stream: true,
                    parallel_tool_calls: true,
                    previous_response_id: previousResponseId,
                    reasoning: { summary: 'auto', effort: 'medium' },
                    text: {
                        verbosity: 'low'
                    }
                });

                let finalContent = '';
                let toolCallsMap: Record<string, { id: string; name: string; args: string }> = {};

                for await (const event of stream) {
                    // Handle reasoning
                    if (event.type === 'response.reasoning_summary_text.delta') {
                        onUpdate({ type: 'reasoning_delta', content: (event as any).delta || '', timestamp: Date.now() });
                    }

                    // Handle content
                    if (event.type === 'response.output_text.delta') {
                        const delta = (event as any).delta || '';
                        finalContent += delta;
                        onUpdate({ type: 'content_delta', content: delta, timestamp: Date.now() });
                    }

                    // Handle function calls
                    if (event.type === 'response.output_item.added') {
                        const item = (event as any).item;
                        if (item?.type === 'function_call') {
                            const callId = item.call_id || item.id || `call_${Date.now()}`;
                            toolCallsMap[callId] = { id: callId, name: item.name || '', args: item.arguments || '' };
                            onUpdate({ type: 'tool_start', id: callId, name: item.name || '', args: {}, timestamp: Date.now() });
                        }
                    }

                    if (event.type === 'response.output_item.done') {
                        const item = (event as any).item || event;
                        if (item?.type === 'function_call' || (event as any).call_id) {
                            const callId = item.call_id || (event as any).call_id || item.id;
                            if (callId) {
                                if (!toolCallsMap[callId]) {
                                    toolCallsMap[callId] = { id: callId, name: item.name || '', args: '' };
                                }
                                if (item.arguments) toolCallsMap[callId].args = item.arguments;
                                if (item.name && !toolCallsMap[callId].name) toolCallsMap[callId].name = item.name;
                            }
                        }
                    }

                    if (event.type === 'response.function_call_arguments.delta') {
                        const callId = (event as any).call_id || (event as any).item_id;
                        if (callId && toolCallsMap[callId]) {
                            toolCallsMap[callId].args += (event as any).delta || '';
                        }
                    }

                    if (event.type === 'response.function_call_arguments.done') {
                        const callId = (event as any).call_id || (event as any).item_id;
                        if (callId && toolCallsMap[callId]) {
                            toolCallsMap[callId].args = (event as any).arguments || '';
                        }
                    }

                    if ((event as any).type === 'response.done') {
                        previousResponseId = (event as any).response?.id;
                    }
                }

                if (finalContent) {
                    messages.push({ type: 'message', role: 'assistant', content: finalContent });
                }

                const completedToolCalls = Object.values(toolCallsMap);

                if (completedToolCalls.length === 0) {
                    onUpdate({ type: 'run_completed', timestamp: Date.now() });
                    break;
                }

                // Execute tool calls
                for (const tc of completedToolCalls) {
                    messages.push({ type: 'function_call', call_id: tc.id, name: tc.name, arguments: tc.args });

                    const toolDef = toolDefinitions.find(t => t.function.name === tc.name);
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

            onUpdate({ type: 'run_completed', timestamp: Date.now() });
        } catch (err) {
            console.error('[UniversalAgent] Error:', err);
            onUpdate({ type: 'content_delta', content: '\n[Error: ' + String(err) + ']', timestamp: Date.now() });
            onUpdate({ type: 'run_completed', timestamp: Date.now() });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isReady, activeFileType, superdocRef, customEditorRef, workspaceFiles, activeFilePath, activeFileHandle, setCellValue, usingSuperDoc, usingCustomEditor]);

    // Store handleAiAction in a ref to avoid dependency issues
    const handleAiActionRef = useRef(handleAiAction);
    handleAiActionRef.current = handleAiAction;

    // Create a stable wrapper function
    const stableHandler = useCallback(async (
        prompt: string,
        history: ChatMessage[],
        onUpdate: (event: AgentEvent) => void,
        images?: string[]
    ) => {
        return handleAiActionRef.current(prompt, history, onUpdate, images);
    }, []);

    // Track if we've registered the handler
    const hasRegisteredRef = useRef(false);

    // Register handler - only run when ready state changes
    useEffect(() => {
        const shouldRegister = isAiInitialized || (isReady && activeFileType && activeFileType !== 'docx');

        if (shouldRegister && !hasRegisteredRef.current) {
            console.log('[UniversalAgent] Registering handler, fileType:', activeFileType);
            setAIActionHandler(stableHandler);
            hasRegisteredRef.current = true;
        } else if (!shouldRegister && hasRegisteredRef.current) {
            setAIActionHandler(null);
            hasRegisteredRef.current = false;
        }

        return () => {
            if (hasRegisteredRef.current) {
                setAIActionHandler(null);
                hasRegisteredRef.current = false;
            }
        };
    }, [isAiInitialized, isReady, activeFileType, stableHandler, setAIActionHandler]);

    // Create voice tool handler for executing individual tools by name
    const voiceToolHandlerRef = useRef<((name: string, args: Record<string, unknown>) => Promise<string>) | null>(null);
    const hasVoiceRegisteredRef = useRef(false);

    useEffect(() => {
        if (!isReady || !setVoiceToolHandler) {
            if (hasVoiceRegisteredRef.current) {
                voiceToolHandlerRef.current = null;
                setVoiceToolHandler?.(null);
                hasVoiceRegisteredRef.current = false;
            }
            return;
        }

        // Only register once when ready
        if (hasVoiceRegisteredRef.current) {
            return;
        }

        // Build tool context
        const contextConfig: UniversalAgentConfig = {
            superdocRef,
            customEditorRef,
            isReady,
            activeFilePath,
            activeFileType,
            activeFileHandle,
            workspaceFiles,
            setAIActionHandler,
            setVoiceToolHandler,
            setCellValue,
            openFileInEditor
        };
        const context = buildToolContext(contextConfig, aiActionsRef.current);
        const toolDefinitions = getToolsForFileType(context, activeFileType);

        // Create handler that can execute tools by name
        const handler = async (toolName: string, args: Record<string, unknown>): Promise<string> => {
            console.log('[UniversalAgent] Voice tool call:', toolName, args);

            // Re-build tools at execution time to get fresh editor state
            const freshContext = buildToolContext(contextConfig, aiActionsRef.current);
            const freshTools = getToolsForFileType(freshContext, activeFileType);
            const toolDef = freshTools.find(t => t.function.name === toolName);

            if (!toolDef) {
                return `Tool "${toolName}" not found. Available tools: ${freshTools.map(t => t.function.name).join(', ')}`;
            }

            try {
                const result = await toolDef.execute(args);
                console.log('[UniversalAgent] Voice tool result:', result);
                return typeof result === 'string' ? result : JSON.stringify(result);
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                console.error('[UniversalAgent] Voice tool error:', errorMsg);
                return `Error executing ${toolName}: ${errorMsg}`;
            }
        };

        voiceToolHandlerRef.current = handler;
        setVoiceToolHandler(handler);
        hasVoiceRegisteredRef.current = true;
        console.log('[UniversalAgent] Voice tool handler registered with', toolDefinitions.length, 'tools');

        return () => {
            if (hasVoiceRegisteredRef.current) {
                voiceToolHandlerRef.current = null;
                setVoiceToolHandler?.(null);
                hasVoiceRegisteredRef.current = false;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isReady, activeFileType]);

    return { isAiInitialized, activeFileType };
}
