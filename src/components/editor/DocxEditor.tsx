'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useRef, useEffect, useCallback } from 'react';
import styles from './DocEditor.module.css';
import { TrackChangesToolbar } from './TrackChangesToolbar';
import { useSuperDoc } from './hooks/useSuperDoc';
import { useFileHandler } from './hooks/useFileHandler';
import { useUniversalAgent } from './hooks/useUniversalAgent';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { FileSystemItem } from '@/types';

interface DocxEditorProps {
    file: File;
    fileName: string;
    handle?: FileSystemFileHandle;
}

export default function DocxEditor({ file, fileName, handle }: DocxEditorProps) {
    const { setAIActionHandler, rootItems, setAttachedSelection, requestComposerFocus, openFile, setDocumentStats, libraryItems, openTabs } = useWorkspace();
    const containerRef = useRef<HTMLDivElement>(null);
    const lastStatsUpdateRef = useRef<number>(0);

    // Initialize formatting and editor core
    const { superdocRef, superdocInstance, isReady, error: docError, toolbarId } = useSuperDoc(containerRef, file, fileName);

    // Handle file operations (saving)
    const { saveError } = useFileHandler(superdocRef, handle, fileName);

    // Helper to find file by path and open it
    const openFileByPath = useCallback(async (path: string): Promise<boolean> => {
        // Normalize path for comparison
        const normalize = (p: string) => p.toLowerCase().replace(/\\/g, '/');
        const targetNorm = normalize(path);

        // Recursively search for file in workspace with flexible matching
        const findItem = (items: FileSystemItem[], parentPath: string = ''): FileSystemItem | null => {
            for (const item of items) {
                const fullPath = parentPath ? `${parentPath}/${item.name}` : item.name;
                const fullPathNorm = normalize(fullPath);
                const itemNameNorm = normalize(item.name);

                // Match: exact path, just filename, or path ending
                if (
                    fullPathNorm === targetNorm ||
                    itemNameNorm === targetNorm ||
                    fullPathNorm.endsWith('/' + targetNorm) ||
                    targetNorm.endsWith('/' + fullPathNorm) ||
                    // Match without directory prefix
                    itemNameNorm === normalize(path.split('/').pop() || path)
                ) {
                    if (item.type === 'file') return item;
                }

                if (item.children) {
                    const found = findItem(item.children, fullPath);
                    if (found) return found;
                }
            }
            return null;
        };

        const item = findItem(rootItems);
        if (!item || !item.handle) {
            console.warn('[DocxEditor] File not found:', path);
            return false;
        }

        try {
            const fileHandle = item.handle as FileSystemFileHandle;
            const fileData = await fileHandle.getFile();
            openFile(item, fileData);
            return true;
        } catch (err) {
            console.error('[DocxEditor] Error opening file:', err);
            return false;
        }
    }, [rootItems, openFile]);

    // Initialize AI capabilities with unified agent
    useUniversalAgent({
        superdocRef,
        isReady,
        activeFilePath: fileName,
        activeFileType: 'docx',
        activeFileHandle: handle,
        workspaceFiles: rootItems,
        openTabs,
        libraryItems,
        setAIActionHandler,
        openFileInEditor: openFileByPath
    });

    // Monitor editor changes and update stats
    useEffect(() => {
        if (!isReady || !superdocInstance) return;

        const updateStats = () => {
            const superdoc = superdocInstance as any;
            const editor = superdoc.editor;

            if (!editor?.state?.doc) return;

            // Throttle updates to once per second
            const now = Date.now();
            if (now - lastStatsUpdateRef.current < 1000) return;
            lastStatsUpdateRef.current = now;

            const doc = editor.state.doc;
            const text = doc.textContent;

            // Simple calculations
            const charCount = text.length;
            const wordCount = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
            const lineCount = doc.childCount; // Approximate, counts blocks

            // Page count estimation (if available) or fallback
            // Note: Superdoc might expose layout info, otherwise we estimate or use 1
            const pageCount = superdoc.pageCount || 1;

            setDocumentStats({
                wordCount,
                charCount,
                lineCount,
                pageCount,
                fileType: 'DOCX'
            });
        };

        // Initial update
        updateStats();

        // Set up interval to check for changes since we can't easily hook into transaction dispatch
        // without writing a plugin
        const intervalId = setInterval(updateStats, 2000);

        return () => {
            clearInterval(intervalId);
            setDocumentStats(null);
        };
    }, [isReady, superdocInstance, setDocumentStats]);

    // Handle Cmd+/ to focus composer with selection as chip
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        // Cmd+/ (Mac) or Ctrl+/ (Windows/Linux) - focus composer, attach selection if available
        if ((e.metaKey || e.ctrlKey) && e.key === '/') {
            e.preventDefault();
            e.stopPropagation();

            const superdoc = superdocRef.current as any;
            const editor = superdoc?.activeEditor || superdoc?.editor || superdoc?.getEditor?.() || superdoc?._editor;

            if (editor?.state?.selection) {
                const { from, to } = editor.state.selection;

                // If there's a selection, attach it as a chip
                if (from !== to) {
                    const selectedText = editor.state.doc.textBetween(from, to, ' ');
                    if (selectedText.trim()) {
                        setAttachedSelection({
                            text: selectedText,
                            fileName: fileName,
                        });
                        return; // setAttachedSelection will open panel and focus
                    }
                }
            }

            // No selection - just focus the composer
            requestComposerFocus();
        }
    }, [superdocRef, fileName, setAttachedSelection, requestComposerFocus]);

    // Add keyboard listener
    useEffect(() => {
        if (!isReady) return;

        window.addEventListener('keydown', handleKeyDown, true);

        return () => {
            window.removeEventListener('keydown', handleKeyDown, true);
        };
    }, [isReady, handleKeyDown]);

    // Unified error handling
    const error = docError || saveError;

    if (error) {
        return (
            <div className={styles.error}>
                <p>{error}</p>
                <p className={styles.hint}>
                    Please check that the file is a valid Word document.
                </p>
            </div>
        );
    }

    return (
        <div className={styles.wrapper}>
            <div id={toolbarId} className={styles.toolbar} />
            {isReady && superdocInstance && (
                <TrackChangesToolbar editor={(superdocInstance as any).editor} />
            )}
            <div
                ref={containerRef}
                className={`${styles.container} ${isReady ? styles.ready : ''} `}
            />
            {!isReady && (
                <div className={styles.loadingOverlay}>
                    <div className={styles.spinner} />
                    <span>Loading document...</span>
                </div>
            )}
        </div>
    );
}
