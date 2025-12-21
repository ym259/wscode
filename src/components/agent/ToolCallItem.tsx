'use client';

import React, { useState } from 'react';
import { Wrench, ChevronDown, ChevronRight } from 'lucide-react';
import { ToolCall } from '@/types';
import styles from './AgentPanel.module.css';

interface ToolCallItemProps {
    tool: ToolCall;
}

/**
 * Expandable display for a single tool call showing name, status, arguments, and result
 */
export function ToolCallItem({ tool }: ToolCallItemProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    const getStatusLabel = () => {
        switch (tool.status) {
            case 'running': return 'Running...';
            case 'success': return 'Completed';
            case 'failure': return 'Failed';
            default: return 'Running...';
        }
    };

    const getStatusClass = () => {
        switch (tool.status) {
            case 'running': return styles.toolStatusRunning;
            case 'success': return styles.toolStatusSuccess;
            case 'failure': return styles.toolStatusFailed;
            default: return styles.toolStatusRunning;
        }
    };

    return (
        <div className={styles.toolCall}>
            <div
                className={styles.toolHeader}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className={`${styles.toolIcon} ${tool.status === 'running' ? styles.toolIconRunning : ''}`}>
                    <Wrench size={12} />
                </div>
                <span className={styles.toolName}>{tool.name}</span>
                <span className={`${styles.toolStatus} ${getStatusClass()}`}>
                    {getStatusLabel()}
                </span>
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </div>

            {isExpanded && (
                <div className={styles.toolDetails}>
                    <div className={styles.toolSection}>
                        <span className={styles.label}>Arguments:</span>
                        <pre>{JSON.stringify(tool.args, null, 2)}</pre>
                    </div>
                    {tool.result && (
                        <div className={styles.toolSection}>
                            <span className={styles.label}>Result:</span>
                            <pre>{JSON.stringify(tool.result, null, 2)}</pre>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
