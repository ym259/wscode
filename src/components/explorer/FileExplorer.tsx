'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { FolderOpen, ChevronDown, ChevronRight, ChevronsLeft, AlertCircle, X, FileText, FolderPlus, FilePlus, Plus, ArrowRight } from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { Dialog } from '@/components/common/Dialog';
import { FileSystemItem } from '@/types';
import FolderTree from './FolderTree';
import OutlineView from './OutlineView';
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

// =============================================================================
// Section Header Component - Unified pattern for all collapsible sections
// =============================================================================

interface SectionHeaderProps {
    title: string;
    isExpanded: boolean;
    onToggle: () => void;
    badge?: number;
    actions?: React.ReactNode;
    showBorder?: boolean;
}

function SectionHeader({ title, isExpanded, onToggle, badge, actions, showBorder = false }: SectionHeaderProps) {
    return (
        <div
            className={`${styles.sectionHeader} ${showBorder ? styles.sectionWithBorder : ''}`}
            onClick={onToggle}
        >
            <span className={styles.sectionChevron}>
                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </span>
            <span className={styles.sectionTitle}>{title}</span>
            {badge !== undefined && (
                <span className={styles.sectionBadge}>{badge}</span>
            )}
            {actions && (
                <div className={styles.sectionActions} onClick={(e) => e.stopPropagation()}>
                    {actions}
                </div>
            )}
        </div>
    );
}

// =============================================================================
// Main FileExplorer Component
// =============================================================================

export default function FileExplorer({ onClose }: FileExplorerProps) {
    const {
        rootItems, setRootItems, addWorkspaceItem, removeWorkspaceItem,
        openFile, activeOutline, libraryItems, createLibraryFile,
        deleteLibraryFile, setAgentInputOverride
    } = useWorkspace();

    const [isLoading, setIsLoading] = useState(false);
    const [permissionStatus, setPermissionStatus] = useState<Record<string, 'granted' | 'prompt' | 'denied'>>({});

    // Section expansion states
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
    const [isLibraryExpanded, setIsLibraryExpanded] = useState(true);
    const [isOutlineExpanded, setIsOutlineExpanded] = useState(true);

    // Resizing state for outline
    const [outlineHeight, setOutlineHeight] = useState(200); // pixels
    const [isResizing, setIsResizing] = useState(false);
    const explorerRef = useRef<HTMLDivElement>(null);

    // Dialog state
    const [isDialogVisible, setIsDialogVisible] = useState(false);
    const [dialogInputValue, setDialogInputValue] = useState('');

    // Initialize expanded folders when root items change
    useEffect(() => {
        setExpandedFolders(new Set(rootItems.map(item => item.path)));
    }, [rootItems.length]); // eslint-disable-line react-hooks/exhaustive-deps

    // Resize handlers
    const startResizing = useCallback(() => {
        setIsResizing(true);
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
    }, []);

    const stopResizing = useCallback(() => {
        setIsResizing(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }, []);

    const resize = useCallback((e: MouseEvent) => {
        if (!isResizing || !explorerRef.current) return;

        const explorerRect = explorerRef.current.getBoundingClientRect();
        const newHeight = explorerRect.bottom - e.clientY;

        // Clamp between 100px and 80% of explorer height
        const maxHeight = explorerRect.height * 0.8;
        const clamped = Math.min(Math.max(newHeight, 100), maxHeight);
        setOutlineHeight(clamped);
    }, [isResizing]);

    useEffect(() => {
        if (isResizing) {
            window.addEventListener('mousemove', resize);
            window.addEventListener('mouseup', stopResizing);
        }
        return () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        };
    }, [isResizing, resize, stopResizing]);

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
    }, [rootItems.length, setRootItems]); // eslint-disable-line react-hooks/exhaustive-deps

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

    const toggleFolderExpand = useCallback((path: string) => {
        setExpandedFolders(prev => {
            const next = new Set(prev);
            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }
            return next;
        });
    }, []);

    // Library handlers
    const handleAddLibraryFile = useCallback(() => {
        setDialogInputValue('');
        setIsDialogVisible(true);
    }, []);

    const handleConfirmAddFile = useCallback(async (name?: string) => {
        if (name) {
            await createLibraryFile(name);
        }
        setIsDialogVisible(false);
    }, [createLibraryFile]);

    const handleLibraryFileClick = useCallback((item: FileSystemItem) => {
        const file = new File([item.content || ''], item.name, { type: 'text/markdown' });
        openFile(item, file);
    }, [openFile]);

    const hasOutline = activeOutline && activeOutline.length > 0;

    return (
        <div className={styles.explorer} ref={explorerRef}>
            {/* Top Header */}
            <div className={styles.header}>
                <span className={styles.title}>Explorer</span>
                <div className={styles.headerActions}>
                    <button className={styles.actionButton} onClick={handleAddFile} title="Add File">
                        <FilePlus size={14} />
                    </button>
                    <button className={styles.actionButton} onClick={handleAddFolder} title="Add Folder">
                        <FolderPlus size={14} />
                    </button>
                    {onClose && (
                        <button className={styles.actionButton} onClick={onClose} title="Minimize Sidebar">
                            <ChevronsLeft size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Main Scrollable Area (Folders + Library) */}
            <div className={styles.mainArea}>
                {/* Opened Folders */}
                {rootItems.filter(item => item.type === 'directory').map((item, index) => (
                    <div key={item.path} className={styles.section}>
                        <SectionHeader
                            title={item.name.toUpperCase()}
                            isExpanded={expandedFolders.has(item.path)}
                            onToggle={() => toggleFolderExpand(item.path)}
                            showBorder={index > 0}
                            actions={
                                <button
                                    className={styles.actionButton}
                                    onClick={() => removeWorkspaceItem(item.path)}
                                    title="Remove from Workspace"
                                >
                                    <X size={14} />
                                </button>
                            }
                        />
                        {expandedFolders.has(item.path) && (
                            <div className={styles.sectionContent}>
                                {permissionStatus[item.path] === 'granted' ? (
                                    <FolderTree items={item.children || []} level={1} />
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
                        )}
                    </div>
                ))}

                {/* Individual Files Section */}
                {rootItems.some(item => item.type === 'file') && (
                    <div className={`${styles.section} ${styles.sectionWithBorder}`}>
                        <SectionHeader
                            title="FILES"
                            isExpanded={true}
                            onToggle={() => { }} // Always expanded for now, or manage state if needed
                            showBorder={true}
                            badge={rootItems.filter(item => item.type === 'file').length}
                        />
                        <div className={styles.sectionContent}>
                            {rootItems.filter(item => item.type === 'file').map((item) => (
                                <div
                                    key={item.path}
                                    className={styles.item}
                                    style={{ paddingLeft: 26 }}
                                    onClick={() => handleFileClick(item)}
                                >
                                    <FileText size={16} />
                                    <span style={{ flex: 1, marginLeft: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {item.name}
                                    </span>
                                    <div className={styles.itemActions}>
                                        <button
                                            className={styles.removeButton}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                removeWorkspaceItem(item.path);
                                            }}
                                            title="Close File"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Empty State (only if no folders and no files) */}
                {rootItems.length === 0 && (
                    <div className={styles.emptyState}>
                        <p className={styles.emptyText}>フォルダが開かれていません</p>
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

                {/* Library Section */}
                <div className={`${styles.section} ${styles.sectionWithBorder}`}>
                    <SectionHeader
                        title="LIBRARY"
                        isExpanded={isLibraryExpanded}
                        onToggle={() => setIsLibraryExpanded(!isLibraryExpanded)}
                        showBorder={true}
                        actions={
                            <button
                                className={styles.actionButton}
                                onClick={handleAddLibraryFile}
                                title="Add Library File"
                            >
                                <Plus size={14} />
                            </button>
                        }
                    />
                    {isLibraryExpanded && (
                        <div className={styles.sectionContent}>
                            {libraryItems.length > 0 ? (
                                libraryItems.map((item) => (
                                    <div
                                        key={item.path}
                                        className={styles.item}
                                        style={{ paddingLeft: 26 }}
                                        onClick={() => handleLibraryFileClick(item)}
                                    >
                                        <FileText size={16} />
                                        <span style={{ flex: 1, marginLeft: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {item.name}
                                        </span>
                                        <div className={styles.itemActions}>
                                            <button
                                                className={styles.actionBut}
                                                title="Apply to Chat"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setAgentInputOverride(`@${item.name} `);
                                                }}
                                            >
                                                <ArrowRight size={14} />
                                            </button>
                                            <button
                                                className={styles.removeButton}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (confirm('Are you sure you want to delete this file?')) {
                                                        deleteLibraryFile(item.path);
                                                    }
                                                }}
                                                title="Delete File"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className={styles.emptyTextSmall}>No library files</p>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Outline Section (fixed at bottom, resizable) */}
            {hasOutline && (
                <div
                    className={styles.outlineSection}
                    style={{
                        height: isOutlineExpanded ? outlineHeight : 'auto',
                        flexShrink: 0
                    }}
                >
                    <OutlineView
                        onResizeStart={startResizing}
                        onExpandedChange={setIsOutlineExpanded}
                    />
                </div>
            )}

            {/* Library File Dialog */}
            <Dialog
                isOpen={isDialogVisible}
                title="ライブラリファイルの作成"
                message="ファイル名を入力してください (例: notes.md):"
                inputValue={dialogInputValue}
                onChange={setDialogInputValue}
                onConfirm={handleConfirmAddFile}
                onCancel={() => setIsDialogVisible(false)}
                isInput={true}
                placeholder="ファイル名"
                confirmLabel="作成"
                cancelLabel="キャンセル"
            />
        </div>
    );
}

