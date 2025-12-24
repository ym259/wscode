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

import { useEffect, useRef, useState, useCallback, RefObject } from 'react';
import { SuperDoc } from '@harbour-enterprises/superdoc';
import { AIActions, createAIProvider } from '@superdoc-dev/ai';
import { ChatMessage, AgentEvent, FileSystemItem } from '@/types';
import {
    ToolContext,
    ToolDefinition,
    getContentTools,
    getFormattingTools,
    getNavigationTools,
    getBlockTools,
    getSpreadsheetTools
} from '@/tools';

/** Supported file types for the agent */
export type FileType = 'docx' | 'xlsx' | 'txt' | 'pdf' | null;

/** Configuration for universal agent */
export interface UniversalAgentConfig {
    /** Reference to SuperDoc instance (for DOCX editing in main app) */
    superdocRef?: RefObject<SuperDoc | null>;
    /** Reference to CustomDocEditor instance (alternative to SuperDoc for editorv2) */
    customEditorRef?: RefObject<any>;
    /** Whether the editor is ready */
    isReady: boolean;
    /** Active file path */
    activeFilePath?: string;
    /** Active file type */
    activeFileType?: FileType;
    /** Active file handle (for direct file access) */
    activeFileHandle?: FileSystemFileHandle;
    /** Workspace files for cross-file access */
    workspaceFiles?: FileSystemItem[];
    /** Handler setter from WorkspaceContext */
    setAIActionHandler: (handler: any) => void;
    /** Voice tool handler setter from WorkspaceContext */
    setVoiceToolHandler?: (handler: ((name: string, args: Record<string, unknown>) => Promise<string>) | null) => void;
    /** XLSX specific: callback for live cell updates */
    setCellValue?: (cell: string, value: string | number, sheetName?: string, isNumber?: boolean) => void;
    /** Callback to open a file in the editor (switches active file) */
    openFileInEditor?: (path: string) => Promise<boolean>;
}

/**
 * Detect file type from path
 */
function detectFileType(path?: string): FileType {
    if (!path) return null;
    const lower = path.toLowerCase();
    if (lower.endsWith('.docx') || lower.endsWith('.doc')) return 'docx';
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'xlsx';
    if (lower.endsWith('.pdf')) return 'pdf';
    if (lower.endsWith('.txt') || lower.endsWith('.md')) return 'txt';
    return null;
}

/**
 * Build tool context for the agent
 */
function buildToolContext(
    config: UniversalAgentConfig,
    aiActions?: AIActions | null
): ToolContext {
    const { superdocRef, customEditorRef, workspaceFiles, activeFilePath, activeFileHandle, setCellValue, openFileInEditor } = config;

    // Helper to get TipTap editor from SuperDoc or CustomDocEditor
    const getEditor = () => {
        // Try CustomDocEditor first (if provided)
        if (customEditorRef?.current) {
            const ce = customEditorRef.current;
            return ce.editor || ce.getEditor?.() || ce;
        }
        // Fall back to SuperDoc
        if (!superdocRef?.current) return null;
        const sd = superdocRef.current as any;
        return sd.activeEditor || sd.editor || sd.getEditor?.() || sd._editor;
    };

    // Helper to get AIActions methods (only available with SuperDoc)
    const getActionMethods = () => aiActions ? (aiActions as any).action : ({} as any);

    return {
        getActionMethods,
        getEditor,
        workspaceFiles,
        activeFilePath,
        activeFileHandle,
        // Expose superdoc or custom editor as 'superdoc' for compatibility
        superdoc: superdocRef?.current || customEditorRef?.current || ({} as any),
        setCellValue,
        openFileInEditor
    };
}

/**
 * Get tools based on file type
 * 
 * - Read tools: Always available for all file types
 * - Write tools: Available based on what file types are open
 */
function getToolsForFileType(context: ToolContext, activeFileType: FileType): ToolDefinition[] {
    const tools: ToolDefinition[] = [];

    // READ TOOLS: Always available (can read any file in workspace)
    tools.push(...getNavigationTools(context));        // readFile, searchDocument
    tools.push(...getSpreadsheetTools(context));       // listSpreadsheetSheets

    // WRITE TOOLS: Based on active file type
    if (activeFileType === 'docx') {
        tools.push(...getContentTools(context));       // insertTrackedChanges, literalReplace, insertTable, etc.
        tools.push(...getFormattingTools(context));    // toggleHeading, toggleBold, etc.
        tools.push(...getBlockTools(context));         // readDocument, deleteBlock, etc.
    }

    if (activeFileType === 'xlsx') {
        // Filter content tools for xlsx-specific ones
        const contentTools = getContentTools(context);
        const xlsxWriteTools = contentTools.filter(t =>
            ['editSpreadsheet'].includes(t.function.name)
        );
        tools.push(...xlsxWriteTools);
    }

    return tools;
}

/**
 * Build system prompt based on file type and context
 */
function buildSystemPrompt(config: UniversalAgentConfig, docStats?: { charCount: number; blockCount: number; estimatedPages: number }): string {
    const { activeFilePath, activeFileType, workspaceFiles } = config;

    // List workspace files for context
    const collectFiles = (items: FileSystemItem[], prefix = ''): string[] => {
        const files: string[] = [];
        for (const item of items) {
            if (item.type === 'file') {
                files.push(`${prefix}${item.name}`);
            } else if (item.children) {
                files.push(...collectFiles(item.children, `${prefix}${item.name}/`));
            }
        }
        return files;
    };
    const workspaceFileList = workspaceFiles ? collectFiles(workspaceFiles).slice(0, 20).join(', ') : 'No files';

    let prompt = `You are an intelligent document assistant with full workspace access.

# Current Context
**ACTIVE FILE: ${activeFilePath ? `"${activeFilePath}"` : 'None'}** (${activeFileType || 'unknown'})
${activeFilePath ? `You can READ any file, but can only WRITE to "${activeFilePath}".` : 'No file is active - open a file to enable editing.'}

Workspace Files: ${workspaceFileList}${workspaceFiles && workspaceFiles.length > 20 ? '...' : ''}
`;

    // Add file-type specific capabilities
    if (activeFileType === 'docx' && docStats) {
        const isLargeDoc = docStats.estimatedPages > 5;
        prompt += `
Document Stats: ~${docStats.charCount.toLocaleString()} chars, ${docStats.estimatedPages} pages, ${docStats.blockCount} blocks

# Capabilities

## Reading (any file)
- \`readFile(path)\`: Read any file. For xlsx, use \`sheets\` param.
- \`listSpreadsheetSheets(path)\`: List sheets in xlsx before reading.
- \`searchDocument(query)\`: Search in active document.
- \`readDocument()\`: Read active document structure with block IDs.

## Writing DOCX (active file)
- \`editText({ find, replace?, bold?, italic?, headingLevel? })\`: Find text, replace + style
  - When the user instruct to change something specifically, only change that part. (e.g. when asked to remove "X" from title, only remove "X" without changing the headings etc)
  - Usage example:
    - Markdown heading: \`editText({ find: "## Title", replace: "Title", headingLevel: 2 })\`
    - Markdown bold: \`editText({ find: "**text**", replace: "text", bold: true })\`
- \`insertTrackedChanges(instruction)\`: AI-powered edits with track changes
- \`literalReplace(find, replace)\`: Exact text replacement
- \`insertTable(headers, rows)\`: Insert table
- \`deleteBlock(blockId)\`: Remove block (requires readDocument first)
- Formatting: \`toggleHeading\`, \`toggleBold\`, \`setFontSize\`, etc.

## Markdown Conversion Guidelines
When converting markdown to Word styles:
1. **Headings**: Use \`editText({ find: "## Heading Text", replace: "Heading Text", headingLevel: 2 })\`
   - MUST include \`replace\` without the "#" symbols!
2. **Bold**: Use \`editText({ find: "**bold text**", replace: "bold text", bold: true })\`
3. **Italic**: Use \`editText({ find: "*italic*", replace: "italic", italic: true })\`
4. **Tables**: 
   - First \`insertTable\` with the data
   - Then delete ALL markdown table lines: header row "| Col1 | Col2 |", divider "|---|---|", and ALL data rows
   - Use \`literalReplace\` to find and replace each markdown table line with empty string
   - OR use \`deleteBlock\` for each line's block ID (get from readDocument)


# Strategy
${isLargeDoc
                ? '- Large doc: Use searchDocument first, then readDocument with range.'
                : '- Small doc: Can use readDocument() for full content.'}
- For deletions: ALWAYS get sdBlockId via readDocument first.
- After list operations: Call fixOrderedListNumbering.

# IMPORTANT: Be Proactive!
- When asked to edit/convert/format, IMMEDIATELY read the document first using \`readDocument()\`
- DO NOT ask clarifying questions if the task is clear
- The user expects you to see and edit their document directly
- Take action first, then report what you did

# Cross-File Workflow
If asked to write data from one file (e.g., xlsx) to another file (e.g., docx):
1. READ the source file first to get the data
2. Call \`openFile("target-file.docx")\` to switch to the target
3. Tell the user: "I've read the data and opened [target file]. Ready to insert the content. Should I proceed?"
4. On user confirmation, continue with the edit using the now-available write tools
`;
    } else if (activeFileType === 'xlsx') {
        prompt += `
# Capabilities

## Reading (any file)
- \`listSpreadsheetSheets(path)\`: List sheets with dimensions
- \`readFile(path, { sheets })\`: Read specific sheets (default: first sheet only)

## Writing XLSX (active file)
- \`editSpreadsheet({ edits })\`: Edit individual cells
  - Example: \`editSpreadsheet({ edits: [{ cell: "A1", value: "Hello" }] })\`
- \`insertRow({ data, rowIndex? })\`: Insert row with data at position or end
  - Example: \`insertRow({ data: ["Col A", "Col B", "Col C"], rowIndex: 5 })\`
- \`deleteRow({ rowIndex })\`: Clear a row's data
  - Example: \`deleteRow({ rowIndex: 3 })\`

# Strategy for Large Spreadsheets
1. Call \`listSpreadsheetSheets\` to see available sheets
2. Call \`readFile({ sheets: ["SheetName"] })\` to read specific sheet(s)
3. Default reads only first sheet to avoid data overload

# Cross-File Workflow
If asked to write data to a DOCX file while viewing this XLSX:
1. READ the data you need from this spreadsheet
2. Call \`openFile("target-file.docx")\` to switch to the DOCX
3. Tell the user: "I've read the data and opened [target file]. Ready to insert. Should I proceed?"
4. On user confirmation, you'll have DOCX write tools available to complete the task
`;
    } else {
        prompt += `
# Capabilities

## Reading (any file)
- \`readFile(path)\`: Read any workspace file
- \`listSpreadsheetSheets(path)\`: For xlsx files, list sheets first

Note: No active editable file. Open a DOCX or XLSX to enable editing.
`;
    }

    prompt += `
# Parallel Tool Execution
You have parallel tool calling enabled. To maximize efficiency:
- **Batch independent operations**: If you need to read multiple files, call \`readFile\` for all of them simultaneously
- **Parallelize independent edits**: Multiple \`editText\` or \`literalReplace\` calls that don't depend on each other should be made in parallel
- **Read before write**: Read operations should complete before dependent writes, but independent reads can run together
- **Example**: To read 3 files → call all 3 \`readFile\` at once, not sequentially

# Task Completion (CRITICAL)
**You MUST complete ALL tasks before stopping.** Do NOT:
- List "remaining tasks" and then stop
- Say "the following still needs to be done" without doing it
- Stop after partial completion

If a task has multiple steps:
1. Execute ALL steps, not just some
2. If you identify remaining work, IMMEDIATELY continue with tool calls
3. Only stop when EVERYTHING is done
4. Your final message should confirm completion, not list TODOs

**WRONG**: "I've done X. Remaining tasks: Y, Z" → then stopping
**CORRECT**: Do X, then Y, then Z → "All tasks completed: X, Y, Z"

# Important Rules
- You can READ any file in the workspace
- You can WRITE only to the active file
- To write to a different file, use \`openFile(path)\` first
- Always confirm with user before proceeding with cross-file edits
- Focus on the user intent and verify the result. Accurate and concise action is appreciated rather than verbose and unnecessary / excessive actions.
`;

    return prompt;
}

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

            // Truncate tool output helper
            const truncateToolOutput = (content: string, maxLength: number = 1000) => {
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

            // ReAct Loop
            let loopCount = 0;
            const MAX_LOOPS = 50;

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

