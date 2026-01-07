'use client';

import React, { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { FileText, Upload } from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useUniversalAgent } from './hooks/useUniversalAgent';
import TabBar from './TabBar';
import styles from './EditorPanel.module.css';

// Dynamically import DocEditor to avoid SSR issues with SuperDoc
const DocEditor = dynamic(() => import('./DocEditor'), {
    ssr: false,
    loading: () => (
        <div className={styles.loading}>
            <div className={styles.spinner} />
            <span>Loading editor...</span>
        </div>
    ),
});

const MarkdownEditor = dynamic(() => import('./MarkdownEditor'), {
    ssr: false,
    loading: () => <div className={styles.loading}>Loading editor...</div>,
});

// Allowed file extensions
const allowedExtensions = ['.docx', '.doc', '.txt', '.md', '.pdf', '.xlsx', '.xls'];

export default function EditorPanel() {
    const { openTabs, activeTabId, libraryItems, rootItems, setAIActionHandler, setVoiceToolHandler, addWorkspaceItem, openFile } = useWorkspace();
    const [isDragging, setIsDragging] = useState(false);

    // Callback to add a newly created file to the workspace
    const addFileToWorkspace = React.useCallback((fileHandle: FileSystemFileHandle) => {
        addWorkspaceItem({
            name: fileHandle.name,
            path: fileHandle.name,
            type: 'file',
            handle: fileHandle,
        });
    }, [addWorkspaceItem]);

    const isAllowedFile = useCallback((fileName: string) => {
        const ext = fileName.toLowerCase();
        return allowedExtensions.some(allowed => ext.endsWith(allowed));
    }, []);

    // Handle file selection via button
    const handleOpenFile = useCallback(async () => {
        try {
            if (!('showOpenFilePicker' in window)) {
                alert('Your browser does not support the File System Access API.');
                return;
            }

            const [fileHandle] = await window.showOpenFilePicker({
                types: [
                    {
                        description: 'Documents',
                        accept: {
                            'text/plain': ['.txt', '.md'],
                            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
                            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
                            'application/vnd.ms-excel': ['.xls'],
                            'application/pdf': ['.pdf']
                        }
                    }
                ],
                multiple: false
            });

            const file = await fileHandle.getFile();
            const item = {
                name: fileHandle.name,
                path: fileHandle.name,
                type: 'file' as const,
                handle: fileHandle,
            };
            addWorkspaceItem(item);
            openFile(item, file);
        } catch (err) {
            if ((err as Error).name !== 'AbortError') {
                console.error('Error opening file:', err);
            }
        }
    }, [addWorkspaceItem, openFile]);

    // Drag and drop handlers
    const handleDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        // Only set to false if leaving the drop zone entirely
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsDragging(false);
        }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const items = e.dataTransfer.items;
        if (!items || items.length === 0) return;

        // Try to get file handle from FileSystemAccess API
        for (const item of Array.from(items)) {
            if (item.kind !== 'file') continue;

            // Try getAsFileSystemHandle for modern browsers
            if ('getAsFileSystemHandle' in item) {
                try {
                    const handle = await (item as DataTransferItem & { getAsFileSystemHandle: () => Promise<FileSystemHandle> }).getAsFileSystemHandle();
                    if (handle && handle.kind === 'file') {
                        const fileHandle = handle as FileSystemFileHandle;
                        if (!isAllowedFile(fileHandle.name)) {
                            alert(`Unsupported file type. Allowed: ${allowedExtensions.join(', ')}`);
                            return;
                        }
                        const file = await fileHandle.getFile();
                        const fsItem = {
                            name: fileHandle.name,
                            path: fileHandle.name,
                            type: 'file' as const,
                            handle: fileHandle,
                        };
                        addWorkspaceItem(fsItem);
                        openFile(fsItem, file);
                        return;
                    }
                } catch (err) {
                    console.error('Failed to get file handle:', err);
                }
            }

            // Fallback to getAsFile for older browsers
            const file = item.getAsFile();
            if (file && isAllowedFile(file.name)) {
                const fsItem = {
                    name: file.name,
                    path: file.name,
                    type: 'file' as const,
                };
                addWorkspaceItem(fsItem);
                openFile(fsItem, file);
                return;
            } else if (file) {
                alert(`Unsupported file type. Allowed: ${allowedExtensions.join(', ')}`);
            }
        }
    }, [addWorkspaceItem, openFile, isAllowedFile]);

    const activeTab = openTabs.find((tab) => tab.id === activeTabId);

    // Always initialize universal agent for workspace-level operations (like listFolder)
    // This ensures the agent has tools even when no document is open
    useUniversalAgent({
        isReady: true,  // Always ready for workspace operations
        workspaceFiles: rootItems,
        libraryItems,
        openTabs,
        setAIActionHandler,
        setVoiceToolHandler,
        addFileToWorkspace,
        // activeFilePath/activeFileType will be undefined when no file is open
        // Individual editors will override with their specific config when mounted
    });

    return (
        <div className={styles.panel}>
            {openTabs.length > 0 ? (
                <>
                    <TabBar />
                    <div className={styles.editorContainer}>
                        {activeTab ? (
                            activeTab.path.startsWith('library/') ? (
                                <MarkdownEditor
                                    key={activeTab.id}
                                    fileKey={activeTab.path}
                                    initialContent={
                                        libraryItems.find(i => i.path === activeTab.path)?.content || ''
                                    }
                                />
                            ) : activeTab.file ? (
                                <DocEditor
                                    key={activeTab.id}
                                    file={activeTab.file}
                                    fileName={activeTab.name}
                                    handle={activeTab.handle}
                                />
                            ) : (
                                <div className={styles.loadingTab}>
                                    <FileText size={48} className={styles.staleIcon} />
                                    <p>Access needed to open {activeTab.name}</p>
                                    <span>Please restore folder access in the sidebar</span>
                                </div>
                            )
                        ) : null}
                    </div>
                </>
            ) : (
                <div
                    className={`${styles.emptyState} ${isDragging ? styles.emptyStateDragging : ''}`}
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                >
                    <div className={`${styles.dropZone} ${isDragging ? styles.dropZoneActive : ''}`}>
                        {isDragging ? (
                            <>
                                <Upload size={64} className={styles.uploadIcon} />
                                <h2 className={styles.emptyTitle}>ファイルをドロップ</h2>
                            </>
                        ) : (
                            <>
                                <FileText size={64} className={styles.emptyIcon} />
                                <h2 className={styles.emptyTitle}>ドキュメントが開かれていません</h2>
                                <p className={styles.emptyText}>
                                    ファイルをここにドラッグ＆ドロップするか、<br />下のボタンから開いてください
                                </p>
                                <button className={styles.openFileButton} onClick={handleOpenFile}>
                                    <Upload size={18} />
                                    <span>ファイルを開く</span>
                                </button>
                            </>
                        )}
                    </div>
                    <div className={styles.shortcuts}>
                        <div className={styles.shortcut}>
                            <kbd>⌘</kbd> + <kbd>O</kbd>
                            <span>フォルダを開く</span>
                        </div>
                        <div className={styles.shortcut}>
                            <kbd>⌘</kbd> + <kbd>N</kbd>
                            <span>新規作成</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
