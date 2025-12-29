import React from 'react';
import { X, FileText } from 'lucide-react';
import styles from './AgentPanel.module.css';

interface AttachmentChipsProps {
    files: string[];
    onRemove: (filename: string) => void;
}

/**
 * Display attached library files as removable chips
 */
export function AttachmentChips({ files, onRemove }: AttachmentChipsProps) {
    if (files.length === 0) return null;

    return (
        <div className={styles.attachmentChips}>
            {files.map((filename) => (
                <div key={filename} className={styles.attachmentChip}>
                    <FileText size={14} />
                    <span>{filename}</span>
                    <button
                        type="button"
                        onClick={() => onRemove(filename)}
                        className={styles.attachmentRemove}
                    >
                        <X size={12} />
                    </button>
                </div>
            ))}
        </div>
    );
}
