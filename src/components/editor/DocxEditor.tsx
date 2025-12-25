'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useRef, useEffect, useCallback } from 'react';
// import '@harbour-enterprises/superdoc/style.css';
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
    const { setAIActionHandler, rootItems, setAttachedSelection, openFile } = useWorkspace();
    const containerRef = useRef<HTMLDivElement>(null);

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
        setAIActionHandler,
        openFileInEditor: openFileByPath
    });

    // Handle Cmd+E to attach selection to chat
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        // Cmd+E (Mac) or Ctrl+E (Windows/Linux)
        if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
            e.preventDefault();
            e.stopPropagation();

            console.log('[DocxEditor] Cmd+E pressed');

            // Get the editor from SuperDoc (same pattern as useAiAssistant.ts)
            const superdoc = superdocRef.current as any;
            const editor = superdoc?.activeEditor || superdoc?.editor || superdoc?.getEditor?.() || superdoc?._editor;

            if (!editor?.state?.selection) {
                console.log('[DocxEditor] No editor found');
                return;
            }

            const { from, to } = editor.state.selection;

            console.log('[DocxEditor] Selection range:', from, to);

            // Only attach if there's a selection (not just a cursor)
            if (from === to) {
                console.log('[DocxEditor] No selection (cursor only)');
                return;
            }

            // Get selected text
            const selectedText = editor.state.doc.textBetween(from, to, ' ');
            console.log('[DocxEditor] Selected text:', selectedText);

            if (selectedText.trim()) {
                setAttachedSelection({
                    text: selectedText,
                    fileName: fileName,
                });
                console.log('[DocxEditor] Selection attached!');
            }
        }
    }, [superdocRef, fileName, setAttachedSelection]);

    // Add keyboard listener with capture phase to intercept before editor
    useEffect(() => {
        if (!isReady) return;

        // Use capture phase to get the event before the editor does
        document.addEventListener('keydown', handleKeyDown, true);
        return () => {
            document.removeEventListener('keydown', handleKeyDown, true);
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
