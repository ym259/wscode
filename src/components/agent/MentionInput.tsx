'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Quote, X } from 'lucide-react';
import { FileSystemItem } from '@/types';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import styles from './AgentPanel.module.css';

interface MentionInputProps {
    value: string;
    onChange: (value: string) => void;
    onSubmit: (message?: string) => void;
    disabled: boolean;
    workspaceFiles: FileSystemItem[];
}

/**
 * Textarea input with @mention autocomplete functionality and attached selection display
 */
export function MentionInput({ value, onChange, onSubmit, disabled, workspaceFiles }: MentionInputProps) {
    const { attachedSelection, clearAttachedSelection } = useWorkspace();
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
    const [mentionStart, setMentionStart] = useState<number>(0);
    const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);

    // Recursively collect all files from workspace
    const collectFiles = useCallback((items: FileSystemItem[], parentPath = ''): { name: string; path: string }[] => {
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

    const allFiles = collectFiles(workspaceFiles);

    // Filter files based on mention query
    const filteredFiles = mentionQuery !== null
        ? allFiles.filter(f =>
            f.name.toLowerCase().includes(mentionQuery.toLowerCase()) ||
            f.path.toLowerCase().includes(mentionQuery.toLowerCase())
        ).slice(0, 8) // Limit to 8 suggestions
        : [];

    // Auto-resize textarea
    useEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = `${textarea.scrollHeight}px`;
        }
    }, [value]);

    // Focus textarea when attached selection is added
    useEffect(() => {
        if (attachedSelection) {
            textareaRef.current?.focus();
        }
    }, [attachedSelection]);

    // Handle input change and detect @mentions
    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value;
        const cursorPos = e.target.selectionStart;
        onChange(newValue);

        // Check if we're in an @mention context
        const textBeforeCursor = newValue.slice(0, cursorPos);
        const atIndex = textBeforeCursor.lastIndexOf('@');

        if (atIndex !== -1) {
            const textAfterAt = textBeforeCursor.slice(atIndex + 1);
            // Check if we're inside a quoted mention (e.g., @"filename with spaces)
            const startsWithQuote = textAfterAt.startsWith('"');
            if (startsWithQuote) {
                // Inside a quoted mention - check if quote is closed
                const queryText = textAfterAt.slice(1); // Remove opening quote
                if (!queryText.includes('"')) {
                    // Quote not closed yet, show suggestions
                    setMentionQuery(queryText);
                    setMentionStart(atIndex);
                    setSelectedMentionIndex(0);
                    return;
                }
            } else {
                // Regular mention - only show suggestions if there's no space after @
                if (!textAfterAt.includes(' ')) {
                    setMentionQuery(textAfterAt);
                    setMentionStart(atIndex);
                    setSelectedMentionIndex(0);
                    return;
                }
            }
        }
        setMentionQuery(null);
    }, [onChange]);

    // Insert selected file mention
    const insertMention = useCallback((file: { name: string; path: string }) => {
        const before = value.slice(0, mentionStart);
        // Check if we started with a quote (for paths with spaces)
        const textAfterAt = value.slice(mentionStart + 1);
        const startsWithQuote = textAfterAt.startsWith('"');
        // Calculate how much to replace: @ + optional quote + query text
        const replaceLength = 1 + (startsWithQuote ? 1 : 0) + (mentionQuery?.length || 0);
        const after = value.slice(mentionStart + replaceLength);
        // Wrap path in quotes if it contains spaces
        const needsQuotes = file.path.includes(' ');
        const formattedPath = needsQuotes ? `"${file.path}"` : file.path;
        const newValue = `${before}@${formattedPath} ${after}`;
        onChange(newValue);
        setMentionQuery(null);
        textareaRef.current?.focus();
    }, [value, mentionStart, mentionQuery, onChange]);

    // Handle form submission with attached selection
    const handleSubmitWithSelection = useCallback(() => {
        let finalMessage = value;

        // If there's an attached selection, prepend it to the message
        if (attachedSelection) {
            const truncatedText = attachedSelection.text.length > 100
                ? attachedSelection.text.slice(0, 100) + '...'
                : attachedSelection.text;
            const selectionPrefix = `@[selection from ${attachedSelection.fileName}: "${truncatedText}"]\n\n`;
            finalMessage = selectionPrefix + value;
            // Clear selection after it's included
            clearAttachedSelection();
        }

        // Pass the complete message directly to onSubmit
        onSubmit(finalMessage);
        onChange(''); // Clear the input
    }, [attachedSelection, value, onChange, onSubmit, clearAttachedSelection]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // Ignore keydown events during IME composition (e.g., Japanese, Chinese, Korean input)
        if (e.nativeEvent.isComposing) {
            return;
        }

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
            handleSubmitWithSelection();
        }
    }, [mentionQuery, filteredFiles, selectedMentionIndex, insertMention, handleSubmitWithSelection]);

    // Truncate selection text for display
    const getDisplayText = (text: string, maxLength = 50) => {
        if (text.length <= maxLength) return text;
        return text.slice(0, maxLength) + '...';
    };

    return (
        <>
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

            {/* Attached selection chip */}
            {attachedSelection && (
                <div className={styles.attachedSelectionContainer}>
                    <div className={styles.attachedSelectionChip}>
                        <Quote size={14} className={styles.chipIcon} />
                        <div className={styles.chipContent}>
                            <span className={styles.chipFileName}>{attachedSelection.fileName}</span>
                            <span className={styles.chipText}>&quot;{getDisplayText(attachedSelection.text)}&quot;</span>
                        </div>
                        <button
                            type="button"
                            className={styles.chipRemoveButton}
                            onClick={clearAttachedSelection}
                            title="Remove selection"
                        >
                            <X size={12} />
                        </button>
                    </div>
                </div>
            )}

            <div className={styles.inputWrapper}>
                <textarea
                    ref={textareaRef}
                    className={styles.input}
                    placeholder={attachedSelection ? "Ask about this selection..." : "Ask anything about your document... Use @ to mention files"}
                    value={value}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    disabled={disabled}
                    rows={1}
                />
                <button
                    type="button"
                    className={styles.sendButton}
                    disabled={!value.trim() || disabled}
                    onClick={handleSubmitWithSelection}
                >
                    <Send size={16} />
                </button>
            </div>
        </>
    );
}
