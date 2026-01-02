'use client';

import React from 'react';
import { GitBranch, AlertCircle, CheckCircle } from 'lucide-react';
import styles from './StatusBar.module.css';
import { useWorkspace } from '@/contexts/WorkspaceContext';

interface StatusBarProps {
    branch?: string;
    documentStatus?: 'saved' | 'unsaved' | 'error';
}

export default function StatusBar({
    branch = 'main',
    documentStatus = 'saved'
}: StatusBarProps) {
    const { documentStats } = useWorkspace();

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
                {documentStats && (
                    <>
                        <div className={styles.item}>
                            {documentStats.charCount} Chars
                        </div>
                    </>
                )}
                <div className={styles.item}>
                    {documentStats?.fileType || 'DOCX'}
                </div>
            </div>
        </div>
    );
}
