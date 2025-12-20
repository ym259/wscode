'use client';

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { X, Send, Sparkles, User, Bot, Wrench, ChevronDown, ChevronRight, FileText, Lightbulb } from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { ToolCall, MessageItem } from '@/types';
import styles from './AgentPanel.module.css';

// Helper function to render message content with colored @mentions
const renderMessageContent = (content: string): React.ReactNode => {
    // Match @mentions: @ followed by a file path (no spaces until end of path)
    const mentionRegex = /@([^\s@]+)/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = mentionRegex.exec(content)) !== null) {
        // Add text before the mention
        if (match.index > lastIndex) {
            parts.push(content.slice(lastIndex, match.index));
        }

        const filePath = match[1];
        const fileName = filePath.split('/').pop() || filePath;

        // Add the styled mention
        parts.push(
            <span key={match.index} className={styles.fileMention}>
                <FileText size={12} className={styles.fileMentionIcon} />
                <span className={styles.fileMentionName}>{fileName}</span>
            </span>
        );

        lastIndex = match.index + match[0].length;
    }

    // Add remaining text after last mention
    if (lastIndex < content.length) {
        parts.push(content.slice(lastIndex));
    }

    return parts.length > 0 ? parts : content;
};

interface AgentPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

const ToolCallItem = ({ tool }: { tool: ToolCall }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div className={styles.toolCall}>
            <div
                className={styles.toolHeader}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className={styles.toolIcon}>
                    <Wrench size={12} />
                </div>
                <span className={styles.toolName}>{tool.name}</span>
                <span className={styles.toolStatus}>
                    {tool.status === 'success' ? 'Completed' : 'Failed'}
                </span>
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </div>

            {isExpanded && (
                <div className={styles.toolDetails}>
                    <div className={styles.toolSection}>
                        <span className={styles.label}>Arguments:</span>
                        <pre>{JSON.stringify(tool.args, null, 2)}</pre>
                    </div>
                    {tool.result && (
                        <div className={styles.toolSection}>
                            <span className={styles.label}>Result:</span>
                            <pre>{JSON.stringify(tool.result, null, 2)}</pre>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// Reasoning component - collapsible display similar to tool calls
const ReasoningItem = ({ reasoning, isStreaming }: { reasoning: string; isStreaming?: boolean }) => {
    const [isExpanded, setIsExpanded] = useState(true); // Default expanded to show streaming

    return (
        <div className={styles.reasoning}>
            <div
                className={styles.reasoningHeader}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <Lightbulb size={12} />
                <span className={styles.reasoningLabel}>
                    {isStreaming ? 'Thinking...' : 'Reasoning'}
                </span>
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </div>
            {isExpanded && (
                <div className={styles.reasoningContent}>
                    {reasoning}
                    {isStreaming && (
                        <span className={styles.reasoningCursor}>▊</span>
                    )}
                </div>
            )}
        </div>
    );
};

export default function AgentPanel({ isOpen, onClose }: AgentPanelProps) {
    const { agentMessages, addMessage, updateMessage, aiActionHandler, rootItems } = useWorkspace();
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // @mention state
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
    const [mentionStart, setMentionStart] = useState<number>(0);
    const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);

    // Recursively collect all files from rootItems
    const collectFiles = useCallback((items: typeof rootItems, parentPath = ''): { name: string; path: string }[] => {
        const files: { name: string; path: string }[] = [];
        for (const item of items) {
            const fullPath = parentPath ? `${parentPath}/${item.name}` : item.name;
            if (item.type === 'file') {
                files.push({ name: item.name, path: fullPath });
            }
            if (item.children && item.children.length > 0) {
                files.push(...collectFiles(item.children, fullPath));
            }
        }
        return files;
    }, []);

    const allFiles = collectFiles(rootItems);

    // Filter files based on mention query
    const filteredFiles = mentionQuery !== null
        ? allFiles.filter(f =>
            f.name.toLowerCase().includes(mentionQuery.toLowerCase()) ||
            f.path.toLowerCase().includes(mentionQuery.toLowerCase())
        ).slice(0, 8) // Limit to 8 suggestions
        : [];

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    // Auto-resize textarea
    useEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = `${textarea.scrollHeight}px`;
        }
    }, [inputValue]);

    // Handle input change and detect @mentions
    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value;
        const cursorPos = e.target.selectionStart;
        setInputValue(value);

        // Check if we're in an @mention context
        const textBeforeCursor = value.slice(0, cursorPos);
        const atIndex = textBeforeCursor.lastIndexOf('@');

        if (atIndex !== -1) {
            const textAfterAt = textBeforeCursor.slice(atIndex + 1);
            // Only show suggestions if there's no space after @ (still typing the mention)
            if (!textAfterAt.includes(' ')) {
                setMentionQuery(textAfterAt);
                setMentionStart(atIndex);
                setSelectedMentionIndex(0);
                return;
            }
        }
        setMentionQuery(null);
    }, []);

    // Insert selected file mention
    const insertMention = useCallback((file: { name: string; path: string }) => {
        const before = inputValue.slice(0, mentionStart);
        const after = inputValue.slice(mentionStart + 1 + (mentionQuery?.length || 0));
        const newValue = `${before}@${file.path} ${after}`;
        setInputValue(newValue);
        setMentionQuery(null);
        textareaRef.current?.focus();
    }, [inputValue, mentionStart, mentionQuery]);


    const handleSubmit = useCallback(async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!inputValue.trim() || isLoading) return;

        const userMessage = inputValue.trim();
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

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // Handle @mention navigation
        if (mentionQuery !== null && filteredFiles.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedMentionIndex(prev => Math.min(prev + 1, filteredFiles.length - 1));
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedMentionIndex(prev => Math.max(prev - 1, 0));
                return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                insertMention(filteredFiles[selectedMentionIndex]);
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                setMentionQuery(null);
                return;
            }
        }

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    }, [handleSubmit, mentionQuery, filteredFiles, selectedMentionIndex, insertMention]);


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

                                    {/* Show streaming indicator when streaming this message */}
                                    {isStreaming && message.id === streamingMsgId && (
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
                {/* @mention suggestion popup */}
                {mentionQuery !== null && filteredFiles.length > 0 && (
                    <div className={styles.mentionPopup}>
                        {filteredFiles.map((file, index) => (
                            <div
                                key={file.path}
                                className={`${styles.mentionItem} ${index === selectedMentionIndex ? styles.mentionItemSelected : ''}`}
                                onClick={() => insertMention(file)}
                                onMouseEnter={() => setSelectedMentionIndex(index)}
                            >
                                <span className={styles.mentionFileName}>{file.name}</span>
                                <span className={styles.mentionFilePath}>{file.path}</span>
                            </div>
                        ))}
                    </div>
                )}
                <div className={styles.inputWrapper}>
                    <textarea
                        ref={textareaRef}
                        className={styles.input}
                        placeholder="Ask anything about your document... Use @ to mention files"
                        value={inputValue}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        disabled={isLoading}
                        rows={1}
                    />
                    <button
                        type="submit"
                        className={styles.sendButton}
                        disabled={!inputValue.trim() || isLoading}
                    >
                        <Send size={16} />
                    </button>
                </div>
            </form>

        </div>
    );
}
