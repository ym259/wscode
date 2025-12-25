'use client';

import React, { useState, useCallback } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen } from 'lucide-react';
import FileIcon from '../common/FileIcon';
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

    const paddingLeft = level * 10;

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
                        <FileIcon fileName={item.name} size={16} className={styles.fileIcon} />
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
