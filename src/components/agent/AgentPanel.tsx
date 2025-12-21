'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, Sparkles, User, Bot } from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { ToolCall, MessageItem } from '@/types';
import { ToolCallItem } from './ToolCallItem';
import { ReasoningItem } from './ReasoningItem';
import { MentionInput } from './MentionInput';
import { renderMessageContent } from './renderMessageContent';
import styles from './AgentPanel.module.css';

interface AgentPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

/**
 * AI Assistant panel with chat interface, tool call display, and file mentions
 */
export default function AgentPanel({ isOpen, onClose }: AgentPanelProps) {
    const { agentMessages, addMessage, updateMessage, aiActionHandler, rootItems } = useWorkspace();
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    const handleSubmit = useCallback(async (e?: React.FormEvent, messageOverride?: string) => {
        e?.preventDefault();

        // Use message override if provided, otherwise use inputValue
        const userMessage = (messageOverride ?? inputValue).trim();
        if (!userMessage || isLoading) return;

        setInputValue('');

        // Add user message
        addMessage({
            role: 'user',
            content: userMessage,
        });

        setIsLoading(true);

        try {
            console.log('[AgentPanel] handleSubmit userMessage:', userMessage);

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

                await aiActionHandler(userMessage, agentMessages, (event) => {
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
                });
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
    }, [inputValue, isLoading, addMessage, updateMessage, scrollToBottom, aiActionHandler, agentMessages]);

    // Scroll to bottom when messages change
    useEffect(() => {
        scrollToBottom();
    }, [agentMessages, scrollToBottom]);

    if (!isOpen) return null;

    return (
        <div className={styles.panel}>
            <div className={styles.header}>
                <div className={styles.headerTitle}>
                    <Sparkles size={16} className={styles.sparkle} />
                    <span>AI Assistant</span>
                </div>
                <button className={styles.closeButton} onClick={onClose} title="Close Panel">
                    <X size={16} />
                </button>
            </div>

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

                                    {/* Render ordered items (reasoning and tool calls) */}
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
                />
            </form>
        </div>
    );
}
