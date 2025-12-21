'use client';

import React, { useState } from 'react';
import { Lightbulb, ChevronDown, ChevronRight } from 'lucide-react';
import styles from './AgentPanel.module.css';

interface ReasoningItemProps {
    reasoning: string;
    isStreaming?: boolean;
}

/**
 * Collapsible display for AI reasoning/thinking process
 */
export function ReasoningItem({ reasoning, isStreaming }: ReasoningItemProps) {
    const [isExpanded, setIsExpanded] = useState(false); // Default collapsed

    return (
        <div className={`${styles.reasoning} ${isStreaming ? styles.reasoningPulsing : ''}`}>
            <div
                className={styles.reasoningHeader}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <Lightbulb size={12} className={isStreaming ? styles.reasoningIconPulsing : ''} />
                <span className={styles.reasoningLabel}>
                    {isStreaming ? 'Thinking...' : 'Reasoning'}
                </span>
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </div>
            {isExpanded && (
                <div className={styles.reasoningContent}>
                    {reasoning}
                    {isStreaming && (
                        <span className={styles.reasoningCursor}>▊</span>
                    )}
                </div>
            )}
        </div>
    );
}
