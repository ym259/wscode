'use client';

import React, { useRef } from 'react';
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
    const { setAIActionHandler, rootItems } = useWorkspace();
    const containerRef = useRef<HTMLDivElement>(null);

    // Initialize formatting and editor core
    const { superdocRef, isReady, error: docError, toolbarId } = useSuperDoc(containerRef, file, fileName);

    // Handle file operations (saving)
    const { saveError } = useFileHandler(superdocRef, handle, fileName);

    // Initialize AI capabilities with workspace file access
    useAiAssistant(superdocRef, isReady, setAIActionHandler, rootItems, fileName);


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
