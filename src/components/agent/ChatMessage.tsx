'use client';

/* eslint-disable @next/next/no-img-element */
import React from 'react';
import { User, Bot } from 'lucide-react';
import { ChatMessage as ChatMessageType, MessageItem } from '@/types';
import { ToolCallItem } from './ToolCallItem';
import { ReasoningItem } from './ReasoningItem';
import { SearchResultsNavigation } from './SearchResultsNavigation';
import { renderMessageContent } from './renderMessageContent';
import styles from './AgentPanel.module.css';

interface ChatMessageProps {
    message: ChatMessageType;
    isStreaming: boolean;
    streamingMsgId: string | null;
    searchNavState: Record<string, number>;
    onSearchNavStateChange: (id: string, index: number) => void;
    onSearchNavClose: (id: string) => void;
    voiceToolHandler?: (name: string, args: Record<string, unknown>) => Promise<string>;
}

/**
 * Individual chat message component that renders user or assistant messages
 * with support for images, tool calls, reasoning, and search results
 */
export function ChatMessage({
    message,
    isStreaming,
    streamingMsgId,
    searchNavState,
    onSearchNavStateChange,
    onSearchNavClose,
    voiceToolHandler,
}: ChatMessageProps) {
    return (
        <div className={`${styles.message} ${styles[message.role]}`}>
            <div className={styles.messageIcon}>
                {message.role === 'user' ? <User size={16} /> : <Bot size={16} />}
            </div>
            <div className={styles.messageContent}>
                <div className={styles.messageRole}>
                    {message.role === 'user' ? 'あなた' : 'アシスタント'}
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
                                            onSearchNavStateChange(item.id, nextIndex);
                                            if (voiceToolHandler) {
                                                const match = item.matches[nextIndex];
                                                voiceToolHandler('scrollToBlock', { blockIndex: match.blockIndex, matchText: match.text });
                                            }
                                        }}
                                        onPrev={() => {
                                            const prevIndex = (currentIndex - 1 + item.matches.length) % item.matches.length;
                                            onSearchNavStateChange(item.id, prevIndex);
                                            if (voiceToolHandler) {
                                                const match = item.matches[prevIndex];
                                                voiceToolHandler('scrollToBlock', { blockIndex: match.blockIndex, matchText: match.text });
                                            }
                                        }}
                                        onSelect={(index) => {
                                            onSearchNavStateChange(item.id, index);
                                            if (voiceToolHandler) {
                                                const match = item.matches[index];
                                                voiceToolHandler('scrollToBlock', { blockIndex: match.blockIndex, matchText: match.text });
                                            }
                                        }}
                                        onClose={() => onSearchNavClose(item.id)}
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

                {/* Show streaming indicator when streaming this message */}
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
    );
}

interface LoadingMessageProps { }

/**
 * Loading indicator message shown while waiting for AI response
 */
export function LoadingMessage({ }: LoadingMessageProps) {
    return (
        <div className={`${styles.message} ${styles.assistant}`}>
            <div className={styles.messageIcon}>
                <Bot size={16} />
            </div>
            <div className={styles.messageContent}>
                <div className={styles.messageRole}>アシスタント</div>
                <div className={styles.typing}>
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        </div>
    );
}
