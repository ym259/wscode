'use client';

import React, { useState, useEffect } from 'react';
import { X, ChevronDown, AlertCircle } from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { MentionInput } from './MentionInput';
import { useAutoScroll } from './useAutoScroll';
import { useAiAgent } from './useAiAgent';
import { useVoiceIntegration } from './useVoiceIntegration';
import { EmptyState } from './EmptyState';
import { ChatMessage, LoadingMessage } from './ChatMessage';
import { AttachmentChips } from './AttachmentChips';
import styles from './AgentPanel.module.css';

interface AgentPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

/**
 * AI Assistant panel with chat interface, tool call display, and file mentions
 */
export default function AgentPanel({ isOpen, onClose }: AgentPanelProps) {
    const {
        agentMessages,
        addMessage,
        updateMessage,
        aiActionHandler,
        voiceToolHandler,
        rootItems,
        libraryItems,
        agentInputOverride,
        setAgentInputOverride
    } = useWorkspace();

    // Track current search navigation index per message
    const [searchNavState, setSearchNavState] = useState<Record<string, number>>({});

    // Track mentioned files as chips
    const [mentionedFiles, setMentionedFiles] = useState<{ name: string; path: string }[]>([]);

    // Auto-scroll hook
    const {
        messagesEndRef,
        messagesContainerRef,
        isUserScrolledUp,
        handleScroll,
        scrollToBottom,
        forceScrollToBottom,
    } = useAutoScroll();

    // AI agent hook
    const {
        inputValue,
        setInputValue,
        selectedImages,
        setSelectedImages,
        attachedLibraryFiles,
        setAttachedLibraryFiles,
        isLoading,
        isStreaming,
        streamingMsgId,
        handleSubmit,
        executeAiAction,
    } = useAiAgent({
        agentMessages,
        addMessage,
        updateMessage,
        aiActionHandler: aiActionHandler ?? undefined,
        voiceToolHandler: voiceToolHandler ?? undefined,
        scrollToBottom,
        agentInputOverride,
        setAgentInputOverride,
    });

    // Voice integration hook
    const {
        voiceError,
    } = useVoiceIntegration({
        agentMessages,
        addMessage,
        updateMessage,
        voiceToolHandler: voiceToolHandler ?? undefined,
        executeAiAction,
        isLoading,
    });

    // Scroll to bottom when messages change
    useEffect(() => {
        scrollToBottom();
    }, [agentMessages, scrollToBottom]);

    // Search navigation handlers
    const handleSearchNavStateChange = (id: string, index: number) => {
        setSearchNavState(prev => ({ ...prev, [id]: index }));
    };

    const handleSearchNavClose = (id: string) => {
        setSearchNavState(prev => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { [id]: _, ...rest } = prev;
            return rest;
        });
    };

    // Early return AFTER all hooks
    if (!isOpen) return null;

    return (
        <div className={styles.panel}>
            <div className={styles.header}>
                <div className={styles.headerTitle}>
                    <span>AIアシスタント</span>
                </div>
                <button className={styles.closeButton} onClick={onClose} title="パネルを閉じる">
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

            <div
                className={styles.messages}
                ref={messagesContainerRef}
                onScroll={handleScroll}
            >
                {agentMessages.length === 0 ? (
                    <EmptyState onSuggestionClick={setInputValue} />
                ) : (
                    <>
                        {agentMessages.map((message) => (
                            <ChatMessage
                                key={message.id}
                                message={message}
                                isStreaming={isStreaming}
                                streamingMsgId={streamingMsgId}
                                searchNavState={searchNavState}
                                onSearchNavStateChange={handleSearchNavStateChange}
                                onSearchNavClose={handleSearchNavClose}
                                voiceToolHandler={voiceToolHandler ?? undefined}
                            />
                        ))}
                        {/* Only show loading bubble if loading AND NOT using streaming handler */}
                        {isLoading && !aiActionHandler && <LoadingMessage />}
                        <div ref={messagesEndRef} />
                    </>
                )}

                {/* Scroll to bottom button */}
                {isUserScrolledUp && agentMessages.length > 0 && (
                    <button
                        className={styles.scrollToBottomButton}
                        onClick={forceScrollToBottom}
                        title="最新のメッセージにスクロール"
                    >
                        <ChevronDown size={18} />
                    </button>
                )}
            </div>

            <AttachmentChips
                files={attachedLibraryFiles}
                onRemove={(filename) => setAttachedLibraryFiles(prev => prev.filter(f => f !== filename))}
            />

            <form className={styles.inputArea} onSubmit={handleSubmit}>
                <MentionInput
                    value={inputValue}
                    onChange={setInputValue}
                    onSubmit={(msg) => handleSubmit(undefined, msg)}
                    disabled={isLoading}
                    workspaceFiles={[...rootItems, ...libraryItems]}
                    selectedImages={selectedImages}
                    onImageAdd={(imgs) => setSelectedImages(prev => [...prev, ...imgs])}
                    onImageRemove={(index) => setSelectedImages(prev => prev.filter((_, i) => i !== index))}
                    mentionedFiles={mentionedFiles}
                    onMentionAdd={(file) => setMentionedFiles(prev => [...prev, file])}
                    onMentionRemove={(path) => setMentionedFiles(prev => prev.filter(f => f.path !== path))}
                />
            </form>
        </div>
    );
}
