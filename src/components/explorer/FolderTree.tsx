'use client';

import React, { useState, useCallback } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, FileText, FileSpreadsheet, FileType, File as FileIcon } from 'lucide-react';
import { FileSystemItem } from '@/types';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import styles from './FolderTree.module.css';

interface FolderTreeProps {
    items: FileSystemItem[];
    level: number;
}

interface FileItemProps {
    item: FileSystemItem;
    level: number;
}

/**
 * Returns the appropriate icon component for a file based on its extension
 */
function getFileIcon(fileName: string, size: number, className: string) {
    const ext = fileName.toLowerCase();

    if (ext.endsWith('.xlsx') || ext.endsWith('.xls')) {
        return <FileSpreadsheet size={size} className={className} style={{ color: '#1D6F42' }} />;
    }
    if (ext.endsWith('.pdf')) {
        return <FileType size={size} className={className} style={{ color: '#E53935' }} />;
    }
    if (ext.endsWith('.docx') || ext.endsWith('.doc')) {
        return <FileText size={size} className={className} style={{ color: '#2B579A' }} />;
    }
    if (ext.endsWith('.md')) {
        return <FileText size={size} className={className} style={{ color: '#42A5F5' }} />;
    }
    if (ext.endsWith('.txt')) {
        return <FileText size={size} className={className} />;
    }
    return <FileIcon size={size} className={className} />;
}

function FileItem({ item, level }: FileItemProps) {
    const { openFile, activeTabId, openTabs } = useWorkspace();
    const [isExpanded, setIsExpanded] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const isActive = openTabs.some(
        (tab) => tab.path === item.path && tab.id === activeTabId
    );

    const handleClick = useCallback(async () => {
        if (item.type === 'directory') {
            setIsExpanded(!isExpanded);
        } else {
            // Open file
            if (!item.handle) return;

            setIsLoading(true);
            try {
                const fileHandle = item.handle as FileSystemFileHandle;
                const file = await fileHandle.getFile();

                // Create a copy of the file in memory to avoid "NotReadableError" when saving
                // This happens because the browser invalidates the original File object when the underlying file is modified
                const arrayBuffer = await file.arrayBuffer();
                const memoryFile = new File([arrayBuffer], file.name, {
                    type: file.type,
                    lastModified: file.lastModified,
                });

                openFile(item, memoryFile);
            } catch (err) {
                console.error('Error opening file:', err);
            } finally {
                setIsLoading(false);
            }
        }
    }, [item, isExpanded, openFile]);

    const paddingLeft = 8 + level * 16;

    return (
        <>
            <div
                className={`${styles.item} ${isActive ? styles.active : ''}`}
                style={{ paddingLeft }}
                onClick={handleClick}
                title={item.path}
            >
                {item.type === 'directory' ? (
                    <>
                        <span className={styles.chevron}>
                            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </span>
                        {isExpanded ? (
                            <FolderOpen size={16} className={styles.folderIcon} />
                        ) : (
                            <Folder size={16} className={styles.folderIcon} />
                        )}
                    </>
                ) : (
                    <>
                        <span className={styles.chevron} />
                        {getFileIcon(item.name, 16, styles.fileIcon)}
                    </>
                )}
                <span className={styles.name}>{item.name}</span>
                {isLoading && <span className={styles.loading}>...</span>}
            </div>

            {item.type === 'directory' && isExpanded && item.children && (
                <FolderTree items={item.children} level={level + 1} />
            )}
        </>
    );
}

export default function FolderTree({ items, level }: FolderTreeProps) {
    return (
        <div className={styles.tree}>
            {items.map((item) => (
                <FileItem key={item.path} item={item} level={level} />
            ))}
        </div>
    );
}
