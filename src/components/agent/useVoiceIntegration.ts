import { useRef, useCallback, useEffect } from 'react';
import { ToolCall, MessageItem, AgentEvent, ChatMessage } from '@/types';
import { useVoiceAgent } from './useVoiceAgent';
import styles from './AgentPanel.module.css';

interface UseVoiceIntegrationOptions {
    agentMessages: ChatMessage[];
    addMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => string;
    updateMessage: (id: string, updates: Partial<ChatMessage>) => void;
    voiceToolHandler?: (name: string, args: Record<string, unknown>) => Promise<string>;
    executeAiAction: (userMessage: string, history: ChatMessage[], images?: string[]) => Promise<void>;
    isLoading: boolean;
}

interface UseVoiceIntegrationReturn {
    voiceConnected: boolean;
    voiceConnecting: boolean;
    voiceListening: boolean;
    voiceSpeaking: boolean;
    voiceError: string | null;
    toggleVoice: () => void;
    getVoiceButtonClass: () => string;
    getVoiceButtonTitle: () => string;
}

/**
 * Hook that integrates voice agent functionality with the chat interface
 */
export function useVoiceIntegration({
    agentMessages,
    addMessage,
    updateMessage,
    voiceToolHandler,
    executeAiAction,
    isLoading,
}: UseVoiceIntegrationOptions): UseVoiceIntegrationReturn {
    // Voice delegation handling
    const voiceRequestResolver = useRef<((response: string) => void) | null>(null);

    // Track current voice assistant message for tool calls
    const voiceMessageIdRef = useRef<string | null>(null);
    const voiceMessageItemsRef = useRef<MessageItem[]>([]);

    // Monitor chat messages to resolve pending voice requests
    useEffect(() => {
        if (voiceRequestResolver.current && !isLoading && agentMessages.length > 0) {
            const lastMsg = agentMessages[agentMessages.length - 1];

            if (lastMsg.role === 'assistant') {
                const responseText = lastMsg.content || "タスクが完了しました。";
                console.log('[useVoiceIntegration] Resolving voice request with:', responseText.substring(0, 50));
                voiceRequestResolver.current(responseText);
                voiceRequestResolver.current = null;
            }
        }
    }, [agentMessages, isLoading]);

    const handleVoiceToolCall = useCallback(async (name: string, args: Record<string, unknown>): Promise<string> => {
        if (name === 'askAgent') {
            const request = args.request as string;
            console.log('[useVoiceIntegration] Delegating voice request to text agent:', request);

            const lastMsg = agentMessages[agentMessages.length - 1];
            const isDuplicate = lastMsg?.role === 'user' && lastMsg.content?.trim() === request.trim();

            let historyToUse = agentMessages;

            if (isDuplicate) {
                console.log('[useVoiceIntegration] Using existing transcript, skipping message add');
                historyToUse = agentMessages.slice(0, -1);
            } else {
                addMessage({
                    role: 'user',
                    content: request,
                });
            }

            executeAiAction(request, historyToUse).catch(err => {
                console.error('[useVoiceIntegration] Voice delegation failed:', err);
                if (voiceRequestResolver.current) {
                    voiceRequestResolver.current("Failed to execute text agent.");
                    voiceRequestResolver.current = null;
                }
            });

            return new Promise<string>((resolve) => {
                if (voiceRequestResolver.current) {
                    voiceRequestResolver.current('Request overridden by new input.');
                }
                voiceRequestResolver.current = resolve;
            });
        }

        if (voiceToolHandler) {
            console.log('[useVoiceIntegration] Executing voice tool via context handler:', name, args);
            return await voiceToolHandler(name, args);
        }
        console.warn('[useVoiceIntegration] No voiceToolHandler available, tool call skipped:', name);
        return `ツール ${name} は利用できません。ドキュメントが開かれていることを確認してください。`;
    }, [voiceToolHandler, addMessage, agentMessages, executeAiAction]);

    const handleVoiceEvent = useCallback((event: AgentEvent) => {
        console.log('[useVoiceIntegration] Voice event:', event);

        if (event.type === 'tool_start') {
            if (!voiceMessageIdRef.current) {
                const msgId = addMessage({
                    role: 'assistant',
                    content: '',
                    items: []
                });
                voiceMessageIdRef.current = msgId;
                voiceMessageItemsRef.current = [];
            }

            const newToolCall: ToolCall = {
                id: event.id,
                name: event.name || 'unknown',
                args: event.args,
                status: 'running',
                timestamp: event.timestamp
            };
            voiceMessageItemsRef.current = [...voiceMessageItemsRef.current, {
                type: 'tool_call',
                data: newToolCall
            }];
            updateMessage(voiceMessageIdRef.current, { items: voiceMessageItemsRef.current });
        } else if (event.type === 'tool_result' && voiceMessageIdRef.current) {
            voiceMessageItemsRef.current = voiceMessageItemsRef.current.map(item =>
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
            updateMessage(voiceMessageIdRef.current, { items: voiceMessageItemsRef.current });
        }
    }, [addMessage, updateMessage]);

    const handleVoiceTranscript = useCallback((text: string, isFinal: boolean, role: 'user' | 'assistant') => {
        if (isFinal && role === 'user') {
            voiceMessageIdRef.current = null;
            voiceMessageItemsRef.current = [];

            addMessage({
                role: 'user',
                content: text,
            });
        } else if (isFinal && role === 'assistant') {
            if (voiceMessageIdRef.current) {
                updateMessage(voiceMessageIdRef.current, { content: text });
            } else {
                addMessage({
                    role: 'assistant',
                    content: text,
                });
            }
            voiceMessageIdRef.current = null;
            voiceMessageItemsRef.current = [];
        }
    }, [addMessage, updateMessage]);

    const {
        isConnected: voiceConnected,
        isConnecting: voiceConnecting,
        isListening: voiceListening,
        isSpeaking: voiceSpeaking,
        error: voiceError,
        toggleSession: toggleVoice,
    } = useVoiceAgent({
        onToolCall: handleVoiceToolCall,
        onEvent: handleVoiceEvent,
        onTranscript: handleVoiceTranscript,
        chatHistory: agentMessages,
    });

    const getVoiceButtonClass = useCallback(() => {
        const classes = [styles.voiceButton];
        if (voiceConnecting) classes.push(styles.voiceButtonConnecting);
        else if (voiceSpeaking) classes.push(styles.voiceButtonSpeaking);
        else if (voiceListening) classes.push(styles.voiceButtonListening);
        else if (voiceConnected) classes.push(styles.voiceButtonActive);
        if (voiceError) classes.push(styles.voiceButtonError);
        return classes.join(' ');
    }, [voiceConnecting, voiceSpeaking, voiceListening, voiceConnected, voiceError]);

    const getVoiceButtonTitle = useCallback(() => {
        if (voiceConnecting) return '接続中...';
        if (voiceSpeaking) return 'AIが話しています...';
        if (voiceListening) return '聞き取り中...';
        if (voiceConnected) return '音声通話中 - クリックして停止';
        return '音声会話を開始';
    }, [voiceConnecting, voiceSpeaking, voiceListening, voiceConnected]);

    return {
        voiceConnected,
        voiceConnecting,
        voiceListening,
        voiceSpeaking,
        voiceError,
        toggleVoice,
        getVoiceButtonClass,
        getVoiceButtonTitle,
    };
}
