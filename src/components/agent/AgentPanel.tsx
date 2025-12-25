'use client';

/* eslint-disable @next/next/no-img-element */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, Sparkles, User, Bot, Mic, MicOff, AlertCircle } from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { ToolCall, MessageItem, AgentEvent, ChatMessage } from '@/types';
import { ToolCallItem } from './ToolCallItem';
import { ReasoningItem } from './ReasoningItem';
import { MentionInput } from './MentionInput';
import { renderMessageContent } from './renderMessageContent';
import { useVoiceAgent } from './useVoiceAgent';
import { SearchResultsNavigation } from './SearchResultsNavigation';
import styles from './AgentPanel.module.css';

interface AgentPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

/**
 * AI Assistant panel with chat interface, tool call display, and file mentions
 */
export default function AgentPanel({ isOpen, onClose }: AgentPanelProps) {
    const { agentMessages, addMessage, updateMessage, aiActionHandler, voiceToolHandler, rootItems } = useWorkspace();
    const [inputValue, setInputValue] = useState('');
    const [selectedImages, setSelectedImages] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Track current search navigation index per message (key: message id)
    const [searchNavState, setSearchNavState] = useState<Record<string, number>>({});

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    const executeAiAction = useCallback(async (userMessage: string, history: ChatMessage[], images: string[] = []) => {
        setIsLoading(true);

        try {
            console.log('[AgentPanel] executeAiAction userMessage:', userMessage);

            // If we have an active document with AIActions, use it for document editing
            if (aiActionHandler) {
                // Create the assistant message and get its ID
                const assistantMsgId = addMessage({
                    role: 'assistant',
                    content: '', // Start empty
                    items: []
                });

                // Set streaming state
                setIsStreaming(true);
                setStreamingMsgId(assistantMsgId);

                // Helper to accumulate content and ordered items
                let currentContent = '';
                let currentItems: MessageItem[] = [];
                let currentReasoningId: string | null = null;

                await aiActionHandler(userMessage, history, (event) => {
                    if (event.type === 'content_delta') {
                        currentContent += event.content;
                        updateMessage(assistantMsgId, { content: currentContent });
                    } else if (event.type === 'reasoning_delta') {
                        // Find or create a reasoning item
                        if (!currentReasoningId) {
                            currentReasoningId = `reasoning_${Date.now()}`;
                            currentItems = [...currentItems, {
                                type: 'reasoning',
                                id: currentReasoningId,
                                content: event.content
                            }];
                        } else {
                            // Append to existing reasoning item
                            currentItems = currentItems.map(item =>
                                item.type === 'reasoning' && item.id === currentReasoningId
                                    ? { ...item, content: item.content + event.content }
                                    : item
                            );
                        }
                        updateMessage(assistantMsgId, { items: currentItems });
                    } else if (event.type === 'tool_start') {
                        // New tool call - end current reasoning block
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
                        // Check for search results and add as inline item
                        try {
                            if (typeof event.result === 'string') {
                                const parsed = JSON.parse(event.result);
                                if (parsed && parsed._action === 'search_results' && Array.isArray(parsed.matches)) {
                                    console.log('[AgentPanel] Received search results:', parsed.matches.length);
                                    // Add search results as a new item in the message
                                    currentItems = [...currentItems, {
                                        type: 'search_results',
                                        id: `search_${Date.now()}`,
                                        matches: parsed.matches,
                                        query: parsed.query || ''
                                    }];
                                    updateMessage(assistantMsgId, { items: currentItems });

                                    // Auto-scroll to first result if available
                                    if (parsed.matches.length > 0 && voiceToolHandler) {
                                        const firstMatch = parsed.matches[0];
                                        voiceToolHandler('scrollToBlock', { blockIndex: firstMatch.blockIndex, matchText: firstMatch.text })
                                            .catch((unknown) => console.error('Auto-scroll failed:', unknown));
                                    }
                                }
                            }
                        } catch {
                            // Ignore parse errors
                        }

                        // Update the tool call with result
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
                }, images.length > 0 ? images : undefined);
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
            console.error('[AgentPanel] AI Error:', error);
            addMessage({
                role: 'assistant',
                content: `Sorry, I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}.`,
            });
        } finally {
            setIsLoading(false);
            scrollToBottom();
        }
    }, [aiActionHandler, addMessage, updateMessage, scrollToBottom, voiceToolHandler]);

    const handleSubmit = useCallback(async (e?: React.FormEvent, messageOverride?: string) => {
        e?.preventDefault();

        // Use message override if provided, otherwise use inputValue
        const userMessage = (messageOverride ?? inputValue).trim();
        if (!userMessage || isLoading) return;

        setInputValue('');
        const currentImages = [...selectedImages];
        setSelectedImages([]);

        // Add user message
        addMessage({
            role: 'user',
            content: userMessage,
            images: currentImages,
        });

        // Execute AI action with current history
        // Note: agentMessages here DOES NOT include the new message yet, which matches handleAiAction expectation
        await executeAiAction(userMessage, agentMessages, currentImages);

    }, [inputValue, selectedImages, isLoading, addMessage, agentMessages, executeAiAction]);

    // Scroll to bottom when messages change
    useEffect(() => {
        scrollToBottom();
    }, [agentMessages, scrollToBottom]);

    // Voice delegation handling
    const voiceRequestResolver = useRef<((response: string) => void) | null>(null);

    // Monitor chat messages to resolve pending voice requests
    useEffect(() => {
        // If we have a pending voice request and the agent is done loading
        if (voiceRequestResolver.current && !isLoading && agentMessages.length > 0) {
            const lastMsg = agentMessages[agentMessages.length - 1];

            // If the last message is from the assistant, we assume it's the response to our delegated query
            if (lastMsg.role === 'assistant') {
                const responseText = lastMsg.content || "Task completed.";
                console.log('[AgentPanel] Resolving voice request with:', responseText.substring(0, 50));
                voiceRequestResolver.current(responseText);
                voiceRequestResolver.current = null;
            }
        }
    }, [agentMessages, isLoading]);

    // Voice agent integration - must be before early return (React rules of hooks)
    const handleVoiceToolCall = useCallback(async (name: string, args: Record<string, unknown>): Promise<string> => {
        // Intercept 'askAgent' delegation tool
        if (name === 'askAgent') {
            const request = args.request as string;
            console.log('[AgentPanel] Delegating voice request to text agent:', request);

            // Check if we need to add a message, or if one was already added by transcript
            const lastMsg = agentMessages[agentMessages.length - 1];
            const isDuplicate = lastMsg?.role === 'user' && lastMsg.content?.trim() === request.trim();

            let historyToUse = agentMessages;

            if (isDuplicate) {
                console.log('[AgentPanel] Using existing transcript, skipping message add');
                // The prompt is already in history, so we valid history is everything BEFORE it
                historyToUse = agentMessages.slice(0, -1);
            } else {
                // Add user message manually
                addMessage({
                    role: 'user',
                    content: request,
                });
                // History is just agentMessages (new msg not included yet)
            }

            // Trigger text agent manually (since addMessage doesn't trigger it automatically)
            // We don't await this inside the promise, but we kick it off
            executeAiAction(request, historyToUse).catch(err => {
                console.error('[AgentPanel] Voice delegation failed:', err);
                if (voiceRequestResolver.current) {
                    voiceRequestResolver.current("Failed to execute text agent.");
                    voiceRequestResolver.current = null;
                }
            });

            // Return a promise that resolves when the text agent completes (monitored by useEffect above)
            return new Promise<string>((resolve) => {
                // If there's an existing pending request, resolve it immediately (cancel/override)
                if (voiceRequestResolver.current) {
                    voiceRequestResolver.current('Request overridden by new input.');
                }
                voiceRequestResolver.current = resolve;
            });
        }

        // Use the voiceToolHandler from context if available (fallback/legacy)
        if (voiceToolHandler) {
            console.log('[AgentPanel] Executing voice tool via context handler:', name, args);
            return await voiceToolHandler(name, args);
        }
        console.warn('[AgentPanel] No voiceToolHandler available, tool call skipped:', name);
        return `Tool ${name} is not available. Please ensure a document is open.`;
    }, [voiceToolHandler, addMessage, agentMessages, executeAiAction]);

    // Track current voice assistant message for tool calls
    const voiceMessageIdRef = useRef<string | null>(null);
    const voiceMessageItemsRef = useRef<MessageItem[]>([]);

    const handleVoiceEvent = useCallback((event: AgentEvent) => {
        console.log('[AgentPanel] Voice event:', event);

        // Handle tool events for voice - similar to text chat
        if (event.type === 'tool_start') {
            // Create or get voice assistant message
            if (!voiceMessageIdRef.current) {
                const msgId = addMessage({
                    role: 'assistant',
                    content: '',
                    items: []
                });
                voiceMessageIdRef.current = msgId;
                voiceMessageItemsRef.current = [];
            }

            // Add tool call to items
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
            // Update tool call with result
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
            // Reset voice message tracking for new conversation turn
            voiceMessageIdRef.current = null;
            voiceMessageItemsRef.current = [];

            // Add user's spoken message to chat
            addMessage({
                role: 'user',
                content: text,
            });
        } else if (isFinal && role === 'assistant') {
            // If we have an existing voice message with tool calls, update it with the text
            if (voiceMessageIdRef.current) {
                updateMessage(voiceMessageIdRef.current, { content: text });
            } else {
                // No tool calls, just add the response
                addMessage({
                    role: 'assistant',
                    content: text,
                });
            }
            // Reset for next turn
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

    // Determine voice button state
    const getVoiceButtonClass = () => {
        const classes = [styles.voiceButton];
        if (voiceConnecting) classes.push(styles.voiceButtonConnecting);
        else if (voiceSpeaking) classes.push(styles.voiceButtonSpeaking);
        else if (voiceListening) classes.push(styles.voiceButtonListening);
        else if (voiceConnected) classes.push(styles.voiceButtonActive);
        if (voiceError) classes.push(styles.voiceButtonError);
        return classes.join(' ');
    };

    const getVoiceButtonTitle = () => {
        if (voiceConnecting) return 'Connecting...';
        if (voiceSpeaking) return 'AI is speaking...';
        if (voiceListening) return 'Listening...';
        if (voiceConnected) return 'Voice active - click to stop';
        return 'Start voice conversation';
    };

    // Early return AFTER all hooks
    if (!isOpen) return null;

    return (
        <div className={styles.panel}>
            <div className={styles.header}>
                <div className={styles.headerTitle}>
                    <Sparkles size={16} className={styles.sparkle} />
                    <span>AI Assistant</span>
                    <button
                        className={getVoiceButtonClass()}
                        onClick={toggleVoice}
                        title={getVoiceButtonTitle()}
                        disabled={voiceConnecting}
                    >
                        {voiceConnected || voiceConnecting ? <Mic size={14} /> : <MicOff size={14} />}
                    </button>
                    {voiceConnected && (
                        <div className={styles.voiceStatus}>
                            <span className={styles.voiceStatusDot} />
                            <span>{voiceListening ? 'Listening' : voiceSpeaking ? 'Speaking' : 'Ready'}</span>
                        </div>
                    )}
                </div>
                <button className={styles.closeButton} onClick={onClose} title="Close Panel">
                    <X size={16} />
                </button>
            </div>

            {/* Voice error display */}
            {voiceError && (
                <div className={styles.voiceError}>
                    <AlertCircle size={14} className={styles.voiceErrorIcon} />
                    <span>{voiceError}</span>
                </div>
            )}

            {/* Search navigation is now rendered inline within messages */}

            <div className={styles.messages}>
                {agentMessages.length === 0 ? (
                    <div className={styles.emptyState}>
                        <Sparkles size={32} className={styles.emptyIcon} />
                        <h3>How can I help you?</h3>
                        <p>Ask me to help draft, edit, or review your documents.</p>
                        <div className={styles.suggestions}>
                            <button
                                className={styles.suggestion}
                                onClick={() => setInputValue('Help me review this contract for potential issues')}
                            >
                                Review contract
                            </button>
                            <button
                                className={styles.suggestion}
                                onClick={() => setInputValue('Suggest improvements for clarity')}
                            >
                                Improve clarity
                            </button>
                            <button
                                className={styles.suggestion}
                                onClick={() => setInputValue('Draft a new section about...')}
                            >
                                Draft new section
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        {agentMessages.map((message) => (
                            <div
                                key={message.id}
                                className={`${styles.message} ${styles[message.role]}`}
                            >
                                <div className={styles.messageIcon}>
                                    {message.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                                </div>
                                <div className={styles.messageContent}>
                                    <div className={styles.messageRole}>
                                        {message.role === 'user' ? 'You' : 'Assistant'}
                                    </div>

                                    {/* Render attached images */}
                                    {message.images && message.images.length > 0 && (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                                            {message.images.map((img, idx) => (
                                                <img
                                                    key={idx}
                                                    src={img}
                                                    alt={`Attached ${idx + 1}`}
                                                    style={{ maxWidth: 200, maxHeight: 200, borderRadius: 4, objectFit: 'contain', border: '1px solid #e1dfdd' }}
                                                />
                                            ))}
                                        </div>
                                    )}

                                    {/* Render ordered items (reasoning, tool calls, and search results) */}
                                    {message.items && message.items.length > 0 && (
                                        <div className={styles.toolCalls}>
                                            {message.items.map((item, idx) => {
                                                if (item.type === 'reasoning') {
                                                    return (
                                                        <ReasoningItem
                                                            key={item.id}
                                                            reasoning={item.content}
                                                            isStreaming={isStreaming && message.id === streamingMsgId && idx === message.items!.length - 1}
                                                        />
                                                    );
                                                } else if (item.type === 'tool_call') {
                                                    return <ToolCallItem key={item.data.id} tool={item.data} />;
                                                } else if (item.type === 'search_results' && item.matches.length > 0) {
                                                    const currentIndex = searchNavState[item.id] || 0;
                                                    return (
                                                        <SearchResultsNavigation
                                                            key={item.id}
                                                            results={item.matches}
                                                            currentIndex={currentIndex}
                                                            onNext={() => {
                                                                const nextIndex = (currentIndex + 1) % item.matches.length;
                                                                setSearchNavState(prev => ({ ...prev, [item.id]: nextIndex }));
                                                                if (voiceToolHandler) {
                                                                    const match = item.matches[nextIndex];
                                                                    voiceToolHandler('scrollToBlock', { blockIndex: match.blockIndex, matchText: match.text });
                                                                }
                                                            }}
                                                            onPrev={() => {
                                                                const prevIndex = (currentIndex - 1 + item.matches.length) % item.matches.length;
                                                                setSearchNavState(prev => ({ ...prev, [item.id]: prevIndex }));
                                                                if (voiceToolHandler) {
                                                                    const match = item.matches[prevIndex];
                                                                    voiceToolHandler('scrollToBlock', { blockIndex: match.blockIndex, matchText: match.text });
                                                                }
                                                            }}
                                                            onSelect={(index) => {
                                                                setSearchNavState(prev => ({ ...prev, [item.id]: index }));
                                                                if (voiceToolHandler) {
                                                                    const match = item.matches[index];
                                                                    voiceToolHandler('scrollToBlock', { blockIndex: match.blockIndex, matchText: match.text });
                                                                }
                                                            }}
                                                            onClose={() => {
                                                                // Remove from nav state (navigation hidden but still in history)
                                                                setSearchNavState(prev => {
                                                                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                                                                    const { [item.id]: _, ...rest } = prev;
                                                                    return rest;
                                                                });
                                                            }}
                                                        />
                                                    );
                                                }
                                                return null;
                                            })}
                                        </div>
                                    )}

                                    {/* Fallback: Render legacy reasoning if present (backwards compat) */}
                                    {!message.items?.length && message.reasoning && (
                                        <ReasoningItem
                                            reasoning={message.reasoning}
                                            isStreaming={isStreaming && message.id === streamingMsgId && !message.content}
                                        />
                                    )}

                                    {/* Fallback: Render legacy tool calls if any (backwards compat) */}
                                    {!message.items?.length && message.toolCalls && message.toolCalls.length > 0 && (
                                        <div className={styles.toolCalls}>
                                            {message.toolCalls.map(tool => (
                                                <ToolCallItem key={tool.id} tool={tool} />
                                            ))}
                                        </div>
                                    )}

                                    {/* Show streaming indicator when streaming this message (but not when content is already being streamed) */}
                                    {isStreaming && message.id === streamingMsgId && !message.content && (
                                        <div className={styles.streamingDots}>
                                            <span></span>
                                            <span></span>
                                            <span></span>
                                        </div>
                                    )}

                                    <div className={styles.messageText}>{renderMessageContent(message.content)}</div>
                                </div>
                            </div>
                        ))}
                        {/* Only show loading bubble if loading AND NOT using streaming handler */}
                        {isLoading && !aiActionHandler && (
                            <div className={`${styles.message} ${styles.assistant}`}>
                                <div className={styles.messageIcon}>
                                    <Bot size={16} />
                                </div>
                                <div className={styles.messageContent}>
                                    <div className={styles.messageRole}>Assistant</div>
                                    <div className={styles.typing}>
                                        <span></span>
                                        <span></span>
                                        <span></span>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </>
                )}
            </div>

            <form className={styles.inputArea} onSubmit={handleSubmit}>
                <MentionInput
                    value={inputValue}
                    onChange={setInputValue}
                    onSubmit={(msg) => handleSubmit(undefined, msg)}
                    disabled={isLoading}
                    workspaceFiles={rootItems}
                    selectedImages={selectedImages}
                    onImageAdd={(imgs) => setSelectedImages(prev => [...prev, ...imgs])}
                    onImageRemove={(index) => setSelectedImages(prev => prev.filter((_, i) => i !== index))}
                />
            </form>
        </div>
    );
}
