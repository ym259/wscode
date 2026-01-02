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
    /** File mentions displayed as chips */
    mentionedFiles?: { name: string; path: string }[];
    onMentionAdd?: (file: { name: string; path: string }) => void;
    onMentionRemove?: (path: string) => void;
}

/**
 * Rich text input with inline @mention chips and autocomplete functionality
 */
export function MentionInput({
    value,
    onChange,
    onSubmit,
    disabled,
    workspaceFiles,
    selectedImages = [],
    onImageAdd,
    onImageRemove,
    mentionedFiles = [],
    onMentionAdd,
    onMentionRemove
}: MentionInputProps) {
    const { attachedSelection, clearAttachedSelection, composerFocusRequested } = useWorkspace();
    const editorRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
    const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
    const lastSelectionRef = useRef<{ node: Node | null; offset: number }>({ node: null, offset: 0 });

    // Recursively collect all files AND folders from workspace
    const collectItems = useCallback((items: FileSystemItem[], parentPath = ''): { name: string; path: string; type: 'file' | 'directory' }[] => {
        const result: { name: string; path: string; type: 'file' | 'directory' }[] = [];

        const collect = (currentItems: FileSystemItem[], currentPath: string) => {
            for (const item of currentItems) {
                const fullPath = currentPath ? `${currentPath}/${item.name}` : item.name;
                // Add both files and directories
                result.push({ name: item.name, path: fullPath, type: item.type });
                if (item.children && item.children.length > 0) {
                    collect(item.children, fullPath);
                }
            }
        };

        collect(items, parentPath);
        return result;
    }, []);

    const allItems = collectItems(workspaceFiles);

    // Filter items (files and folders) based on mention query
    // Prioritize folders when query matches exactly, then files
    const filteredItems = useMemo(() => {
        if (mentionQuery === null) return [];
        
        const query = mentionQuery.toLowerCase();
        const matching = allItems.filter(f =>
            f.name.toLowerCase().includes(query) ||
            f.path.toLowerCase().includes(query)
        );
        
        // Sort: exact name matches first, then folders, then by path length (shorter = more relevant)
        return matching
            .sort((a, b) => {
                const aExact = a.name.toLowerCase() === query ? 0 : 1;
                const bExact = b.name.toLowerCase() === query ? 0 : 1;
                if (aExact !== bExact) return aExact - bExact;
                
                // Folders before files when relevance is similar
                if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
                
                return a.path.length - b.path.length;
            })
            .slice(0, 10);
    }, [allItems, mentionQuery]);

    // Focus editor when attached selection is added or when focus is explicitly requested
    useEffect(() => {
        if (attachedSelection || composerFocusRequested > 0) {
            editorRef.current?.focus();
        }
    }, [attachedSelection, composerFocusRequested]);

    // Extract plain text from contenteditable for the value prop
    const getPlainText = useCallback((): string => {
        if (!editorRef.current) return '';

        let text = '';
        const walk = (node: Node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                text += node.textContent || '';
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node as HTMLElement;
                // Check if it's a mention chip
                if (el.dataset.mentionPath) {
                    text += `@${el.dataset.mentionPath}`;
                } else {
                    // Recurse into children
                    el.childNodes.forEach(walk);
                }
            }
        };

        editorRef.current.childNodes.forEach(walk);
        return text;
    }, []);

    // Detect @mention query from current cursor position
    const detectMentionQuery = useCallback(() => {
        const selection = window.getSelection();
        if (!selection || !selection.rangeCount) {
            setMentionQuery(null);
            return;
        }

        const range = selection.getRangeAt(0);
        const node = range.startContainer;

        // Only detect in text nodes
        if (node.nodeType !== Node.TEXT_NODE) {
            setMentionQuery(null);
            return;
        }

        const text = node.textContent || '';
        const cursorPos = range.startOffset;
        const textBeforeCursor = text.slice(0, cursorPos);
        const atIndex = textBeforeCursor.lastIndexOf('@');

        if (atIndex !== -1) {
            const query = textBeforeCursor.slice(atIndex + 1);
            // Only show suggestions if no space after @
            if (!query.includes(' ')) {
                setMentionQuery(query);
                setSelectedMentionIndex(0);
                // Save selection for later restoration
                lastSelectionRef.current = { node, offset: cursorPos };
                return;
            }
        }
        setMentionQuery(null);
    }, []);

    // Handle input in contenteditable
    const handleInput = useCallback(() => {
        const newValue = getPlainText();
        onChange(newValue);
        detectMentionQuery();
    }, [getPlainText, onChange, detectMentionQuery]);

    // Insert mention chip at current cursor position
    const insertMention = useCallback((item: { name: string; path: string; type: 'file' | 'directory' }) => {
        const editor = editorRef.current;
        if (!editor) return;

        const selection = window.getSelection();
        if (!selection || !selection.rangeCount) return;

        // Find the text node with the @ query and remove it
        const { node, offset } = lastSelectionRef.current;
        if (!node || node.nodeType !== Node.TEXT_NODE) return;

        const text = node.textContent || '';
        const atIndex = text.lastIndexOf('@', offset - 1);
        if (atIndex === -1) return;

        // Split text around the @query
        const beforeAt = text.slice(0, atIndex);
        const afterCursor = text.slice(offset);

        // Create the mention chip element
        const chip = document.createElement('span');
        chip.className = styles.inlineMentionChip;
        chip.contentEditable = 'false';
        chip.dataset.mentionPath = item.path;
        chip.dataset.mentionType = item.type;
        
        // Different icons for files vs folders
        const fileIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`;
        const folderIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
        const icon = item.type === 'directory' ? folderIcon : fileIcon;
        
        chip.innerHTML = `
            <span class="${styles.inlineMentionIcon}">${icon}</span>
            <span class="${styles.inlineMentionText}">${item.name}${item.type === 'directory' ? '/' : ''}</span>
            <button type="button" class="${styles.inlineMentionRemove}" title="Remove">×</button>
        `;

        // Add click handler to remove button
        const removeBtn = chip.querySelector(`.${styles.inlineMentionRemove}`) as HTMLButtonElement;
        if (removeBtn) {
            removeBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                chip.remove();
                onMentionRemove?.(item.path);
                handleInput(); // Update the value
                editor.focus();
            };
        }

        // Replace text node with: beforeAt + chip + space + afterCursor
        const parent = node.parentNode;
        if (!parent) return;

        const beforeNode = document.createTextNode(beforeAt);
        const spaceNode = document.createTextNode(' ');
        const afterNode = document.createTextNode(afterCursor);

        parent.replaceChild(afterNode, node);
        parent.insertBefore(spaceNode, afterNode);
        parent.insertBefore(chip, spaceNode);
        parent.insertBefore(beforeNode, chip);

        // Set cursor after the space
        const newRange = document.createRange();
        newRange.setStart(spaceNode, 1);
        newRange.setEnd(spaceNode, 1);
        selection.removeAllRanges();
        selection.addRange(newRange);

        // Track mention (convert to the expected format)
        if (onMentionAdd && !mentionedFiles.some(f => f.path === item.path)) {
            onMentionAdd({ name: item.name, path: item.path });
        }

        setMentionQuery(null);
        handleInput();
    }, [onMentionAdd, onMentionRemove, mentionedFiles, handleInput]);

    // Handle form submission
    const handleSubmitWithSelection = useCallback(() => {
        let finalMessage = getPlainText();

        // If there's an attached selection, prepend it
        if (attachedSelection) {
            const truncatedText = attachedSelection.text.length > 100
                ? attachedSelection.text.slice(0, 100) + '...'
                : attachedSelection.text;
            const selectionPrefix = `@[selection from ${attachedSelection.fileName}: "${truncatedText}"]\n\n`;
            finalMessage = selectionPrefix + finalMessage;
            clearAttachedSelection();
        }

        onSubmit(finalMessage);

        // Clear the editor
        if (editorRef.current) {
            editorRef.current.innerHTML = '';
        }
        onChange('');

        // Clear mentioned files
        mentionedFiles.forEach(f => onMentionRemove?.(f.path));
    }, [getPlainText, attachedSelection, onSubmit, onChange, clearAttachedSelection, mentionedFiles, onMentionRemove]);

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
        e.target.value = '';
    }, [onImageAdd]);

    // Handle paste for images
    const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
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

        if (imageFiles.length === 0) return;

        e.preventDefault();

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

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.nativeEvent.isComposing) return;

        // Handle @mention navigation
        if (mentionQuery !== null && filteredItems.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedMentionIndex(prev => Math.min(prev + 1, filteredItems.length - 1));
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedMentionIndex(prev => Math.max(prev - 1, 0));
                return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                insertMention(filteredItems[selectedMentionIndex]);
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
    }, [mentionQuery, filteredItems, selectedMentionIndex, insertMention, handleSubmitWithSelection]);

    // Truncate selection text for display
    const getDisplayText = (text: string, maxLength = 50) => {
        if (text.length <= maxLength) return text;
        return text.slice(0, maxLength) + '...';
    };

    return (
        <>
            {/* @mention suggestion popup */}
            {mentionQuery !== null && filteredItems.length > 0 && (
                <div className={styles.mentionPopup}>
                    {filteredItems.map((item, index) => (
                        <div
                            key={item.path}
                            className={`${styles.mentionItem} ${index === selectedMentionIndex ? styles.mentionItemSelected : ''}`}
                            onClick={() => insertMention(item)}
                            onMouseEnter={() => setSelectedMentionIndex(index)}
                        >
                            <span className={styles.mentionItemIcon}>
                                {item.type === 'directory' ? (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                                    </svg>
                                ) : (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                        <polyline points="14 2 14 8 20 8"/>
                                    </svg>
                                )}
                            </span>
                            <span className={styles.mentionFileName}>
                                {item.name}{item.type === 'directory' ? '/' : ''}
                            </span>
                            <span className={styles.mentionFilePath}>{item.path}</span>
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
                <div
                    ref={editorRef}
                    className={styles.input}
                    contentEditable={!disabled}
                    onInput={handleInput}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    data-placeholder={attachedSelection || selectedImages.length > 0 ? "Ask about this..." : "Ask anything about your document..."}
                    suppressContentEditableWarning
                    style={{
                        minHeight: '20px',
                        maxHeight: '200px',
                        overflowY: 'auto',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                    }}
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
