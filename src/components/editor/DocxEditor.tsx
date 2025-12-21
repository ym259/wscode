'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import '@harbour-enterprises/superdoc/style.css';
import styles from './DocEditor.module.css';
import { TrackChangesToolbar } from './TrackChangesToolbar';
import { useSuperDoc } from './hooks/useSuperDoc';
import { useFileHandler } from './hooks/useFileHandler';
import { useAiAssistant } from './hooks/useAiAssistant';
import { useWorkspace } from '@/contexts/WorkspaceContext';

interface DocxEditorProps {
    file: File;
    fileName: string;
    handle?: FileSystemFileHandle;
}

export default function DocxEditor({ file, fileName, handle }: DocxEditorProps) {
    const { setAIActionHandler, rootItems, setAttachedSelection } = useWorkspace();
    const containerRef = useRef<HTMLDivElement>(null);

    // Initialize formatting and editor core
    const { superdocRef, isReady, error: docError, toolbarId } = useSuperDoc(containerRef, file, fileName);

    // Handle file operations (saving)
    const { saveError } = useFileHandler(superdocRef, handle, fileName);

    // Initialize AI capabilities with workspace file access
    useAiAssistant(superdocRef, isReady, setAIActionHandler, rootItems, fileName);

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
            {isReady && superdocRef.current && (
                <TrackChangesToolbar editor={(superdocRef.current as any).editor} />
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
