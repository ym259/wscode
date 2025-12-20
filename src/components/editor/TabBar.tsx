'use client';

import React from 'react';
import { X, FileText } from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import styles from './TabBar.module.css';

export default function TabBar() {
    const { openTabs, activeTabId, setActiveTab, closeTab } = useWorkspace();

    return (
        <div className={styles.tabBar}>
            <div className={styles.tabs}>
                {openTabs.map((tab) => (
                    <div
                        key={tab.id}
                        className={`${styles.tab} ${tab.id === activeTabId ? styles.active : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        <FileText size={14} className={styles.tabIcon} />
                        <span className={styles.tabName}>{tab.name}</span>
                        {tab.isDirty && <span className={styles.dirty}>●</span>}
                        <button
                            className={styles.closeButton}
                            onClick={(e) => {
                                e.stopPropagation();
                                closeTab(tab.id);
                            }}
                            title="Close"
                        >
                            <X size={14} />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
