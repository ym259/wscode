'use client';

import React from 'react';
import { Files, Search, GitBranch, Settings } from 'lucide-react';
import styles from './ActivityBar.module.css';

interface ActivityBarProps {
    activeView: string;
    onViewChange: (view: string) => void;
}

const activities = [
    { id: 'explorer', icon: Files, label: 'Explorer' },
    { id: 'search', icon: Search, label: 'Search' },
    { id: 'git', icon: GitBranch, label: 'Source Control' },
];

const bottomActivities = [
    { id: 'settings', icon: Settings, label: 'Settings' },
];

export default function ActivityBar({ activeView, onViewChange }: ActivityBarProps) {
    return (
        <div className={styles.activityBar}>
            <div className={styles.topSection}>
                {activities.map((activity) => (
                    <button
                        key={activity.id}
                        className={`${styles.activityButton} ${activeView === activity.id ? styles.active : ''}`}
                        onClick={() => onViewChange(activity.id)}
                        title={activity.label}
                    >
                        <activity.icon size={24} />
                    </button>
                ))}
            </div>
            <div className={styles.bottomSection}>
                {bottomActivities.map((activity) => (
                    <button
                        key={activity.id}
                        className={`${styles.activityButton} ${activeView === activity.id ? styles.active : ''}`}
                        onClick={() => onViewChange(activity.id)}
                        title={activity.label}
                    >
                        <activity.icon size={24} />
                    </button>
                ))}
            </div>
        </div>
    );
}
