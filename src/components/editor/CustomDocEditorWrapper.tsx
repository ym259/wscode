'use client';

import React, { useRef, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useUniversalAgent } from './hooks/useUniversalAgent';
import { useCustomFileHandler } from './hooks/useCustomFileHandler';
import { CustomDocEditorHandle } from './CustomDocEditor';
import styles from './DocEditor.module.css';

// Dynamically import CustomDocEditor to avoid SSR issues
const CustomDocEditor = dynamic(
    () => import('./CustomDocEditor').then(mod => ({ default: mod.CustomDocEditor })),
    {
        ssr: false,
        loading: () => (
            <div className={styles.loadingOverlay}>
                <div className={styles.spinner} />
                <span>Loading editor...</span>
            </div>
        )
    }
);

interface CustomDocEditorWrapperProps {
    file: File;
    fileName: string;
    handle?: FileSystemFileHandle;
}

export default function CustomDocEditorWrapper({ file, fileName, handle }: CustomDocEditorWrapperProps) {
    const { setAIActionHandler, setVoiceToolHandler, rootItems } = useWorkspace();
    const editorRef = useRef<CustomDocEditorHandle>(null);
    const [editorReady, setEditorReady] = useState(false);

    // Initialize Universal Agent with CustomDocEditor
    useUniversalAgent({
        customEditorRef: editorRef,
        isReady: editorReady,
        activeFilePath: fileName,
        activeFileType: 'docx',
        activeFileHandle: handle,
        workspaceFiles: rootItems,
        setAIActionHandler,
        setVoiceToolHandler,
        // TODO: Implement openFileInEditor for CustomDocEditor if needed, 
        // similar to DocxEditor's openFileByPath if looking to support cross-file nav
    });

    // Handle file operations (saving)
    useCustomFileHandler(editorRef, handle, fileName);

    // Check if editor is ready
    useEffect(() => {
        if (editorReady) return;

        const checkEditor = () => {
            if (editorRef.current?.editor) {
                setEditorReady(true);
            }
        };

        const interval = setInterval(checkEditor, 100);
        checkEditor();

        return () => clearInterval(interval);
    }, [file, editorReady]);

    return (
        <div className={styles.wrapper}>
            <div className={`${styles.container} ${styles.ready}`}>
                <CustomDocEditor ref={editorRef} file={file} />
            </div>
        </div>
    );
}
