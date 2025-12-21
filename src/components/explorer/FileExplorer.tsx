'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { FolderOpen, ChevronDown, ChevronsLeft, AlertCircle, X, FileText, FolderPlus, FilePlus } from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { FileSystemItem } from '@/types';
import FolderTree from './FolderTree';
import styles from './FileExplorer.module.css';

interface FileExplorerProps {
    onClose?: () => void;
}

async function readDirectory(
    dirHandle: FileSystemDirectoryHandle,
    path: string = ''
): Promise<FileSystemItem[]> {
    const items: FileSystemItem[] = [];

    for await (const [name, handle] of dirHandle.entries()) {
        const itemPath = path ? `${path}/${name}` : name;

        if (handle.kind === 'directory') {
            const children = await readDirectory(handle as FileSystemDirectoryHandle, itemPath);
            items.push({
                name,
                path: itemPath,
                type: 'directory',
                children,
                handle,
            });
        } else {
            // Only include document files
            const ext = name.toLowerCase();
            if (ext.endsWith('.docx') || ext.endsWith('.doc') || ext.endsWith('.txt') || ext.endsWith('.md') || ext.endsWith('.pdf') || ext.endsWith('.xlsx') || ext.endsWith('.xls')) {
                items.push({
                    name,
                    path: itemPath,
                    type: 'file',
                    handle,
                });
            }
        }
    }

    // Sort: directories first, then alphabetically
    return items.sort((a, b) => {
        if (a.type !== b.type) {
            return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
    });
}

export default function FileExplorer({ onClose }: FileExplorerProps) {
    const { rootItems, setRootItems, addWorkspaceItem, removeWorkspaceItem, openFile } = useWorkspace();
    const [isLoading, setIsLoading] = useState(false);
    const [permissionStatus, setPermissionStatus] = useState<Record<string, 'granted' | 'prompt' | 'denied'>>({});

    // Check permission status for all root items
    useEffect(() => {
        const checkPermissions = async () => {
            const statuses: Record<string, 'granted' | 'prompt' | 'denied'> = {};
            let itemsChanged = false;
            const updatedItems = [...rootItems];

            for (let i = 0; i < updatedItems.length; i++) {
                const item = updatedItems[i];
                if (!item.handle) continue;

                const status = await item.handle.queryPermission({ mode: 'read' });
                statuses[item.path] = status;

                // Load children for directory if granted and empty
                if (status === 'granted' && item.type === 'directory' && (!item.children || item.children.length === 0)) {
                    try {
                        const children = await readDirectory(item.handle as FileSystemDirectoryHandle);
                        updatedItems[i] = { ...item, children };
                        itemsChanged = true;
                    } catch (err) {
                        console.error('Failed to auto-load directory:', item.path, err);
                    }
                }
            }

            setPermissionStatus(statuses);
            if (itemsChanged) {
                setRootItems(updatedItems);
            }
        };

        if (rootItems.length > 0) {
            checkPermissions();
        }
    }, [rootItems.length, setRootItems]);

    const handleRestoreAccess = useCallback(async (item: FileSystemItem) => {
        if (!item.handle) return;

        try {
            const status = await item.handle.requestPermission({ mode: 'read' });
            setPermissionStatus((prev: Record<string, 'granted' | 'prompt' | 'denied'>) => ({ ...prev, [item.path]: status }));

            if (status === 'granted') {
                setIsLoading(true);
                if (item.type === 'directory') {
                    const children = await readDirectory(item.handle as FileSystemDirectoryHandle);
                    const updatedItems = rootItems.map(ri =>
                        ri.path === item.path ? { ...ri, children } : ri
                    );
                    setRootItems(updatedItems);
                }
            }
        } catch (err) {
            console.error('Error restoring access:', err);
        } finally {
            setIsLoading(false);
        }
    }, [rootItems, setRootItems]);

    const handleAddFolder = useCallback(async () => {
        try {
            if (!('showDirectoryPicker' in window)) {
                alert('Your browser does not support the File System Access API.');
                return;
            }

            const dirHandle = await window.showDirectoryPicker();
            const children = await readDirectory(dirHandle);

            addWorkspaceItem({
                name: dirHandle.name,
                path: dirHandle.name,
                type: 'directory',
                children,
                handle: dirHandle,
            });
        } catch (err) {
            if ((err as Error).name !== 'AbortError') {
                console.error('Error opening folder:', err);
            }
        }
    }, [addWorkspaceItem]);

    const handleAddFile = useCallback(async () => {
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

            addWorkspaceItem({
                name: fileHandle.name,
                path: fileHandle.name,
                type: 'file',
                handle: fileHandle,
            });
        } catch (err) {
            if ((err as Error).name !== 'AbortError') {
                console.error('Error opening file:', err);
            }
        }
    }, [addWorkspaceItem]);

    const handleFileClick = useCallback(async (item: FileSystemItem) => {
        if (item.type === 'file' && item.handle) {
            try {
                const file = await (item.handle as FileSystemFileHandle).getFile();
                openFile(item, file);
            } catch (err) {
                console.error('Failed to open file:', err);
            }
        }
    }, [openFile]);

    return (
        <div className={styles.explorer}>
            <div className={styles.header}>
                <span className={styles.title}>EXPLORER</span>
                <div className={styles.actions}>
                    <button
                        className={styles.actionButton}
                        onClick={handleAddFile}
                        title="Add File"
                    >
                        <FilePlus size={14} />
                    </button>
                    <button
                        className={styles.actionButton}
                        onClick={handleAddFolder}
                        title="Add Folder"
                    >
                        <FolderPlus size={14} />
                    </button>
                    {onClose && (
                        <button
                            className={styles.actionButton}
                            onClick={onClose}
                            title="Minimize Sidebar"
                        >
                            <ChevronsLeft size={14} />
                        </button>
                    )}
                </div>
            </div>

            <div className={styles.treeContainer}>
                {rootItems.length > 0 ? (
                    rootItems.map((item) => (
                        <div key={item.path} className={styles.rootSection}>
                            <div className={styles.folderHeader}>
                                {item.type === 'directory' ? <ChevronDown size={14} /> : <FileText size={14} />}
                                <span
                                    className={styles.folderName}
                                    onClick={item.type === 'file' ? () => handleFileClick(item) : undefined}
                                    style={{ cursor: item.type === 'file' ? 'pointer' : 'default' }}
                                >
                                    {item.name.toUpperCase()}
                                </span>
                                <button
                                    className={styles.removeButton}
                                    onClick={() => removeWorkspaceItem(item.path)}
                                    title="Remove from Workspace"
                                >
                                    <X size={14} />
                                </button>
                            </div>

                            {permissionStatus[item.path] === 'granted' ? (
                                item.type === 'directory' && <FolderTree items={item.children || []} level={1} />
                            ) : (
                                <div className={styles.permissionPrompt}>
                                    <AlertCircle size={16} className={styles.warningIcon} />
                                    <p className={styles.permissionText}>Access needed</p>
                                    <button
                                        className={styles.restoreButton}
                                        onClick={() => handleRestoreAccess(item)}
                                        disabled={isLoading}
                                    >
                                        {isLoading ? '...' : 'Restore'}
                                    </button>
                                </div>
                            )}
                        </div>
                    ))
                ) : (
                    <div className={styles.emptyState}>
                        <p className={styles.emptyText}>No folder opened</p>
                        <button
                            className={styles.openButton}
                            onClick={handleAddFolder}
                            disabled={isLoading}
                        >
                            <FolderOpen size={16} />
                            <span>{isLoading ? 'Opening...' : 'Open Folder'}</span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
