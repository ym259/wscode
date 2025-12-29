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
    const { setAIActionHandler, setVoiceToolHandler, rootItems, setDocumentStats, libraryItems, openTabs } = useWorkspace();
    const editorRef = useRef<CustomDocEditorHandle>(null);
    const [editorReady, setEditorReady] = useState(false);
    const lastStatsUpdateRef = useRef<number>(0);

    // Initialize Universal Agent with CustomDocEditor
    useUniversalAgent({
        customEditorRef: editorRef,
        isReady: editorReady,
        activeFilePath: fileName,
        activeFileType: 'docx',
        activeFileHandle: handle,
        workspaceFiles: rootItems,
        openTabs,
        libraryItems,
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

    // Helper for CJK-aware word counting
    const countWords = (text: string): number => {
        if (!text) return 0;

        // Try to use Intl.Segmenter if available (modern browsers)
        if (typeof Intl !== 'undefined' && (Intl as any).Segmenter) {
            try {
                const segmenter = new (Intl as any).Segmenter('ja', { granularity: 'word' });
                let count = 0;
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                for (const segment of segmenter.segment(text)) {
                    if (segment.isWordLike) {
                        count++;
                    }
                }
                return count;
            } catch (e) {
                console.warn('Intl.Segmenter failed, falling back to regex', e);
            }
        }

        // Fallback for environments without Intl.Segmenter or on error
        // A simple approximation: Count contiguous non-CJK strings as words, and count each CJK character as a word.

        const cjkRegex = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/g;
        const cjkChars = text.match(cjkRegex) || [];
        const nonCjkText = text.replace(cjkRegex, ' ');
        const nonCjkWords = nonCjkText.trim().split(/\s+/).filter(w => w.length > 0).length;

        return nonCjkWords + cjkChars.length;
    };

    // Monitor editor changes and update stats
    useEffect(() => {
        if (!editorReady || !editorRef.current) return;

        const updateStats = () => {
            const editor = editorRef.current?.editor;
            if (!editor?.state?.doc) return;

            // Throttle updates to once per second
            const now = Date.now();
            if (now - lastStatsUpdateRef.current < 1000) return;
            lastStatsUpdateRef.current = now;

            const doc = editor.state.doc;
            const text = doc.textContent;

            // Accurate CJK Word Count
            const wordCount = countWords(text);
            const charCount = text.length;

            // Visual Line Count (exposed from CustomDocEditor handle) with fallback to block count
            const visualLineCount = editorRef.current?.getVisualLineCount?.() || doc.childCount;

            // Accurate Page count from CustomDocEditor handle
            const pageCount = editorRef.current?.getPageCount?.() || 1;

            setDocumentStats({
                wordCount,
                charCount,
                lineCount: visualLineCount,
                pageCount,
                fileType: 'DOCX'
            });
        };

        // Initial update
        updateStats();

        // Check for changes periodically
        const intervalId = setInterval(updateStats, 2000);

        return () => {
            clearInterval(intervalId);
            setDocumentStats(null);
        };
    }, [editorReady, setDocumentStats]);

    return (
        <div className={styles.wrapper}>
            <div className={`${styles.container} ${styles.ready}`}>
                <CustomDocEditor ref={editorRef} file={file} />
            </div>
        </div>
    );
}
