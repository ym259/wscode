'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { FileText } from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
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

export default function EditorPanel() {
    const { openTabs, activeTabId } = useWorkspace();

    const activeTab = openTabs.find((tab) => tab.id === activeTabId);

    return (
        <div className={styles.panel}>
            {openTabs.length > 0 ? (
                <>
                    <TabBar />
                    <div className={styles.editorContainer}>
                        {activeTab ? (
                            activeTab.file ? (
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
                <div className={styles.emptyState}>
                    <FileText size={64} className={styles.emptyIcon} />
                    <h2 className={styles.emptyTitle}>No Document Open</h2>
                    <p className={styles.emptyText}>
                        Open a folder from the sidebar and select a document to start editing.
                    </p>
                    <div className={styles.shortcuts}>
                        <div className={styles.shortcut}>
                            <kbd>⌘</kbd> + <kbd>O</kbd>
                            <span>Open Folder</span>
                        </div>
                        <div className={styles.shortcut}>
                            <kbd>⌘</kbd> + <kbd>N</kbd>
                            <span>New Document</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
