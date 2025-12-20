'use client';

import React from 'react';
import { GitBranch, AlertCircle, CheckCircle } from 'lucide-react';
import styles from './StatusBar.module.css';

interface StatusBarProps {
    branch?: string;
    cursorPosition?: { line: number; column: number };
    documentStatus?: 'saved' | 'unsaved' | 'error';
}

export default function StatusBar({
    branch = 'main',
    cursorPosition = { line: 1, column: 1 },
    documentStatus = 'saved'
}: StatusBarProps) {
    return (
        <div className={styles.statusBar}>
            <div className={styles.leftSection}>
                <div className={styles.item}>
                    <GitBranch size={14} />
                    <span>{branch}</span>
                </div>
                {documentStatus === 'error' && (
                    <div className={`${styles.item} ${styles.error}`}>
                        <AlertCircle size={14} />
                        <span>Error</span>
                    </div>
                )}
                {documentStatus === 'saved' && (
                    <div className={styles.item}>
                        <CheckCircle size={14} />
                        <span>Saved</span>
                    </div>
                )}
            </div>

            <div className={styles.rightSection}>
                <div className={styles.item}>
                    Ln {cursorPosition.line}, Col {cursorPosition.column}
                </div>
                <div className={styles.item}>UTF-8</div>
                <div className={styles.item}>DOCX</div>
            </div>
        </div>
    );
}
