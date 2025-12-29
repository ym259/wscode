'use client';

import React, { useEffect, useState, useCallback } from 'react';
import styles from './PdfViewer.module.css';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useUniversalAgent } from './hooks/useUniversalAgent';
import { FileSystemItem } from '@/types';

interface PdfViewerProps {
    file: File;
    fileName?: string;
    handle?: FileSystemFileHandle;
}

export default function PdfViewer({ file, fileName, handle }: PdfViewerProps) {
    const { setDocumentStats, setAIActionHandler, rootItems, openFile, libraryItems, openTabs } = useWorkspace();
    const [url, setUrl] = useState<string | null>(null);

    // Helper to find file by path and open it
    const openFileByPath = useCallback(async (path: string): Promise<boolean> => {
        const normalize = (p: string) => p.toLowerCase().replace(/\\/g, '/');
        const targetNorm = normalize(path);

        const findItem = (items: FileSystemItem[], parentPath: string = ''): FileSystemItem | null => {
            for (const item of items) {
                const fullPath = parentPath ? `${parentPath}/${item.name}` : item.name;
                const fullPathNorm = normalize(fullPath);
                const itemNameNorm = normalize(item.name);

                if (
                    fullPathNorm === targetNorm ||
                    itemNameNorm === targetNorm ||
                    fullPathNorm.endsWith('/' + targetNorm) ||
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
            console.warn('[PdfViewer] File not found:', path);
            return false;
        }

        try {
            const fileHandle = item.handle as FileSystemFileHandle;
            const fileData = await fileHandle.getFile();
            openFile(item, fileData);
            return true;
        } catch (err) {
            console.error('[PdfViewer] Error opening file:', err);
            return false;
        }
    }, [rootItems, openFile]);

    // Enable AI Assistant with unified agent
    useUniversalAgent({
        isReady: true, // PDFs don't need parsing, always ready
        activeFilePath: fileName || file.name,
        activeFileType: 'pdf',
        activeFileHandle: handle,
        workspaceFiles: rootItems,
        openTabs,
        libraryItems,
        setAIActionHandler,
        openFileInEditor: openFileByPath
    });

    useEffect(() => {
        setDocumentStats({
            wordCount: 0,
            charCount: 0,
            lineCount: 0,
            pageCount: 0,
            fileType: 'PDF'
        });

        return () => {
            setDocumentStats(null);
        };
    }, [setDocumentStats]);

    useEffect(() => {
        const objectUrl = URL.createObjectURL(file);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setUrl(objectUrl);

        return () => {
            URL.revokeObjectURL(objectUrl);
            setUrl(null);
        };
    }, [file]);

    if (!url) return null;

    return (
        <div className={styles.wrapper}>
            <embed
                src={url}
                type="application/pdf"
                className={styles.viewer}
            />
        </div>
    );
}

