'use client';

/* eslint-disable @next/next/no-img-element */
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Send, Quote, X, Paperclip, Image as ImageIcon } from 'lucide-react';
import { FileSystemItem } from '@/types';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import styles from './AgentPanel.module.css';

interface MentionInputProps {
    value: string;
    onChange: (value: string) => void;
    onSubmit: (message?: string) => void;
    disabled: boolean;
    workspaceFiles: FileSystemItem[];
    selectedImages?: string[];
    onImageAdd?: (images: string[]) => void;
    onImageRemove?: (index: number) => void;
}

/**
 * Textarea input with @mention autocomplete functionality and attached selection display
 */
export function MentionInput({ value, onChange, onSubmit, disabled, workspaceFiles, selectedImages = [], onImageAdd, onImageRemove }: MentionInputProps) {
    const { attachedSelection, clearAttachedSelection } = useWorkspace();
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
    const [mentionStart, setMentionStart] = useState<number>(0);
    const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);

    // Recursively collect all files from workspace
    // Recursively collect all files from workspace
    const collectFiles = useCallback((items: FileSystemItem[], parentPath = ''): { name: string; path: string }[] => {
        const files: { name: string; path: string }[] = [];

        const collect = (currentItems: FileSystemItem[], currentPath: string) => {
            for (const item of currentItems) {
                const fullPath = currentPath ? `${currentPath}/${item.name}` : item.name;
                if (item.type === 'file') {
                    files.push({ name: item.name, path: fullPath });
                }
                if (item.children && item.children.length > 0) {
                    collect(item.children, fullPath);
                }
            }
        };

        collect(items, parentPath);
        return files;
    }, []);

    const allFiles = collectFiles(workspaceFiles);

    // Filter files based on mention query
    const filteredFiles = useMemo(() => {
        return mentionQuery !== null
            ? allFiles.filter(f =>
                f.name.toLowerCase().includes(mentionQuery.toLowerCase()) ||
                f.path.toLowerCase().includes(mentionQuery.toLowerCase())
            ).slice(0, 8) // Limit to 8 suggestions
            : [];
    }, [allFiles, mentionQuery]);

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

    // Handle file selection
    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        const imagePromises = files.map(file => {
            return new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (event) => resolve(event.target?.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        });

        Promise.all(imagePromises).then(base64Images => {
            if (onImageAdd) onImageAdd(base64Images);
        });
        e.target.value = ''; // Reset input
    }, [onImageAdd]);

    // Handle paste event for clipboard images (e.g., screenshots)
    const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        const imageFiles: File[] = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) imageFiles.push(file);
            }
        }

        if (imageFiles.length === 0) return; // No images, let default paste handle text

        e.preventDefault(); // Prevent default paste only if we have images

        const imagePromises = imageFiles.map(file => {
            return new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (event) => resolve(event.target?.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        });

        Promise.all(imagePromises).then(base64Images => {
            if (onImageAdd) onImageAdd(base64Images);
        });
    }, [onImageAdd]);

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

            {/* Attached Images */}
            {selectedImages.length > 0 && (
                <div className={styles.attachedSelectionContainer}>
                    {selectedImages.map((img, idx) => (
                        <div key={idx} className={styles.attachedSelectionChip} style={{ padding: '4px 8px' }}>
                            <ImageIcon size={14} className={styles.chipIcon} />
                            <div className={styles.chipContent}>
                                <img src={img} alt="attached" style={{ width: 20, height: 20, objectFit: 'cover', borderRadius: 2 }} />
                                <span className={styles.chipFileName}>Image {idx + 1}</span>
                            </div>
                            <button
                                type="button"
                                className={styles.chipRemoveButton}
                                onClick={() => onImageRemove?.(idx)}
                                title="Remove image"
                            >
                                <X size={12} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <div className={styles.inputWrapper}>
                <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                    accept="image/*"
                    multiple
                />
                <button
                    type="button"
                    className={styles.attachButton}
                    onClick={() => fileInputRef.current?.click()}
                    title="Attach image"
                    disabled={disabled}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: '#6b7280',
                        cursor: 'pointer',
                        padding: '8px',
                        display: 'flex',
                        alignItems: 'center',
                    }}
                >
                    <Paperclip size={18} />
                </button>
                <textarea
                    ref={textareaRef}
                    className={styles.input}
                    placeholder={attachedSelection || selectedImages.length > 0 ? "Ask about this..." : "Ask anything about your document..."}
                    value={value}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
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
