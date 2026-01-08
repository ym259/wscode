import { useState, useCallback, useEffect } from 'react';
import { ToolCall, MessageItem, ChatMessage, Attachment } from '@/types';

interface UseAiAgentOptions {
    agentMessages: ChatMessage[];
    addMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => string;
    updateMessage: (id: string, updates: Partial<ChatMessage>) => void;
    aiActionHandler?: (
        prompt: string,
        history: ChatMessage[],
        onEvent: (event: import('@/types').AgentEvent) => void,
        images?: string[],
        attachments?: Attachment[]
    ) => Promise<void>;
    voiceToolHandler?: (name: string, args: Record<string, unknown>) => Promise<string>;
    scrollToBottom: () => void;
    agentInputOverride: string | null;
    setAgentInputOverride: (value: string | null) => void;
}

interface UseAiAgentReturn {
    inputValue: string;
    setInputValue: (value: string) => void;
    selectedImages: string[];
    setSelectedImages: React.Dispatch<React.SetStateAction<string[]>>;
    attachments: Attachment[];
    setAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>;
    attachedLibraryFiles: string[];
    setAttachedLibraryFiles: React.Dispatch<React.SetStateAction<string[]>>;
    isLoading: boolean;
    isStreaming: boolean;
    streamingMsgId: string | null;
    handleSubmit: (e?: React.FormEvent, messageOverride?: string) => Promise<void>;
    executeAiAction: (userMessage: string, history: ChatMessage[], images?: string[], attachments?: Attachment[]) => Promise<void>;
    uploadFile: (file: File) => Promise<string>;
}

/**
 * Hook that encapsulates AI agent execution logic including:
 * - Streaming event handling
 * - Tool call processing
 * - Form submission
 * - Image attachment handling
 * - File upload handling
 */
export function useAiAgent({
    agentMessages,
    addMessage,
    updateMessage,
    aiActionHandler,
    voiceToolHandler,
    scrollToBottom,
    agentInputOverride,
    setAgentInputOverride,
}: UseAiAgentOptions): UseAiAgentReturn {
    // Helper to upload file to backend to get file_id
    const uploadFile = async (file: File): Promise<string> => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('purpose', 'assistants');

        const response = await fetch('/api/ai/files', {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            throw new Error('Failed to upload file');
        }

        const data = await response.json();
        return data.id;
    };

    return useAiAgentHook({
        agentMessages,
        addMessage,
        updateMessage,
        aiActionHandler,
        voiceToolHandler,
        scrollToBottom,
        agentInputOverride,
        setAgentInputOverride,
        uploadFile
    });
}

function useAiAgentHook({
    agentMessages,
    addMessage,
    updateMessage,
    aiActionHandler,
    voiceToolHandler,
    scrollToBottom,
    agentInputOverride,
    setAgentInputOverride,
    uploadFile
}: UseAiAgentOptions & { uploadFile: (file: File) => Promise<string> }): UseAiAgentReturn {
    const [inputValue, setInputValue] = useState('');
    const [selectedImages, setSelectedImages] = useState<string[]>([]);
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
    const [attachedLibraryFiles, setAttachedLibraryFiles] = useState<string[]>([]);

    // Handle input override from external components
    useEffect(() => {
        if (agentInputOverride) {
            const filename = agentInputOverride.replace('@', '').trim();
            setAttachedLibraryFiles(prev =>
                prev.includes(filename) ? prev : [...prev, filename]
            );
            setAgentInputOverride(null);
        }
    }, [agentInputOverride, setAgentInputOverride]);

    const executeAiAction = useCallback(async (userMessage: string, history: ChatMessage[], images: string[] = [], attachments: Attachment[] = []) => {
        setIsLoading(true);

        try {
            console.log('[useAiAgent] executeAiAction userMessage:', userMessage);
            console.log('[useAiAgent] aiActionHandler exists?', !!aiActionHandler);

            if (aiActionHandler) {
                const assistantMsgId = addMessage({
                    role: 'assistant',
                    content: '',
                    items: []
                });

                setIsStreaming(true);
                setStreamingMsgId(assistantMsgId);

                let currentContent = '';
                let currentItems: MessageItem[] = [];
                let currentReasoningId: string | null = null;

                await aiActionHandler(userMessage, history, (event) => {
                    if (event.type === 'content_delta') {
                        currentContent += event.content;
                        updateMessage(assistantMsgId, { content: currentContent });
                    } else if (event.type === 'reasoning_delta') {
                        if (!currentReasoningId) {
                            currentReasoningId = `reasoning_${Date.now()}`;
                            currentItems = [...currentItems, {
                                type: 'reasoning',
                                id: currentReasoningId,
                                content: event.content
                            }];
                        } else {
                            currentItems = currentItems.map(item =>
                                item.type === 'reasoning' && item.id === currentReasoningId
                                    ? { ...item, content: item.content + event.content }
                                    : item
                            );
                        }
                        updateMessage(assistantMsgId, { items: currentItems });
                    } else if (event.type === 'tool_start') {
                        currentReasoningId = null;

                        const newToolCall: ToolCall = {
                            id: event.id,
                            name: event.name,
                            args: event.args,
                            status: 'running',
                            timestamp: event.timestamp
                        };
                        currentItems = [...currentItems, {
                            type: 'tool_call',
                            data: newToolCall
                        }];
                        updateMessage(assistantMsgId, { items: currentItems });
                    } else if (event.type === 'tool_result') {
                        // Check for search results
                        try {
                            if (typeof event.result === 'string') {
                                const parsed = JSON.parse(event.result);
                                if (parsed && parsed._action === 'search_results' && Array.isArray(parsed.matches)) {
                                    console.log('[useAiAgent] Received search results:', parsed.matches.length);
                                    currentItems = [...currentItems, {
                                        type: 'search_results',
                                        id: `search_${Date.now()}`,
                                        matches: parsed.matches,
                                        query: parsed.query || ''
                                    }];
                                    updateMessage(assistantMsgId, { items: currentItems });

                                    if (parsed.matches.length > 0 && voiceToolHandler) {
                                        const firstMatch = parsed.matches[0];
                                        voiceToolHandler('scrollToBlock', { blockIndex: firstMatch.blockIndex, matchText: firstMatch.text })
                                            .catch((err) => console.error('Auto-scroll failed:', err));
                                    }
                                }
                            }
                        } catch {
                            // Ignore parse errors
                        }

                        currentItems = currentItems.map(item =>
                            item.type === 'tool_call' && item.data.id === event.id
                                ? {
                                    ...item,
                                    data: {
                                        ...item.data,
                                        result: event.result,
                                        status: event.status,
                                        ...(event.args ? { args: event.args } : {})
                                    }
                                }
                                : item
                        );
                        updateMessage(assistantMsgId, { items: currentItems });
                    } else if (event.type === 'run_completed') {
                        setIsLoading(false);
                        setIsStreaming(false);
                        setStreamingMsgId(null);
                    }
                }, images.length > 0 ? images : undefined, attachments.length > 0 ? attachments : undefined);
            } else {
                // Fallback to regular chat API
                const response = await fetch('/api/ai', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt: userMessage }),
                });

                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Failed to get AI response');

                addMessage({
                    role: 'assistant',
                    content: data.content || 'No response received.',
                });
            }
        } catch (error) {
            console.error('[useAiAgent] AI Error:', error);
            addMessage({
                role: 'assistant',
                content: `申し訳ありません、エラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}。`,
            });
        } finally {
            setIsLoading(false);
            scrollToBottom();
        }
    }, [aiActionHandler, addMessage, updateMessage, scrollToBottom, voiceToolHandler]);

    const handleSubmit = useCallback(async (e?: React.FormEvent, messageOverride?: string) => {
        e?.preventDefault();

        const userMessage = (messageOverride ?? inputValue).trim();
        if (!userMessage || isLoading) return;

        let finalMessage = userMessage;
        if (attachedLibraryFiles.length > 0) {
            const mentions = attachedLibraryFiles.map(f => `@${f}`).join(' ');
            finalMessage = `${mentions}\n${userMessage}`;
        }

        setInputValue('');
        setAttachedLibraryFiles([]);
        const currentImages = [...selectedImages];
        const currentAttachments = [...attachments];
        setSelectedImages([]);
        setAttachments([]);

        addMessage({
            role: 'user',
            content: finalMessage,
            images: currentImages,
            attachments: currentAttachments
        });

        await executeAiAction(finalMessage, agentMessages, currentImages, currentAttachments);
    }, [inputValue, selectedImages, attachments, isLoading, addMessage, agentMessages, executeAiAction, attachedLibraryFiles]);

    return {
        inputValue,
        setInputValue,
        selectedImages,
        setSelectedImages,
        attachments,
        setAttachments,
        attachedLibraryFiles,
        setAttachedLibraryFiles,
        isLoading,
        isStreaming,
        streamingMsgId,
        handleSubmit,
        executeAiAction,
        uploadFile,
    };
}
