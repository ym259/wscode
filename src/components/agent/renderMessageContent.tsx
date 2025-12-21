import React from 'react';
import { FileText, Quote } from 'lucide-react';
import styles from './AgentPanel.module.css';

/**
 * Renders message content with colored @mentions for file paths and selections
 */
export function renderMessageContent(content: string): React.ReactNode {
    // Combined regex for both selection references and file mentions
    // Selection format: @[selection from filename: "text"]
    // File mention format: @filepath OR @"filepath with spaces"
    const combinedRegex = /@\[selection from ([^:]+): "([^"]+)"\]|@"([^"]+)"|@([^\s@\[\]"]+)/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = combinedRegex.exec(content)) !== null) {
        // Add text before the match
        if (match.index > lastIndex) {
            parts.push(content.slice(lastIndex, match.index));
        }

        if (match[1] && match[2]) {
            // Selection reference: @[selection from filename: "text"]
            const fileName = match[1];
            const selectedText = match[2];

            parts.push(
                <span key={match.index} className={styles.selectionMention}>
                    <Quote size={12} className={styles.selectionMentionIcon} />
                    <span className={styles.selectionMentionContent}>
                        <span className={styles.selectionMentionFile}>{fileName}</span>
                        <span className={styles.selectionMentionText}>&quot;{selectedText}&quot;</span>
                    </span>
                </span>
            );
        } else if (match[3] || match[4]) {
            // File mention: @"filepath with spaces" (match[3]) or @filepath (match[4])
            const filePath = match[3] || match[4];
            const fileName = filePath.split('/').pop() || filePath;

            parts.push(
                <span key={match.index} className={styles.fileMention}>
                    <FileText size={12} className={styles.fileMentionIcon} />
                    <span className={styles.fileMentionName}>{fileName}</span>
                </span>
            );
        }

        lastIndex = match.index + match[0].length;
    }

    // Add remaining text after last match
    if (lastIndex < content.length) {
        parts.push(content.slice(lastIndex));
    }

    return parts.length > 0 ? parts : content;
}
