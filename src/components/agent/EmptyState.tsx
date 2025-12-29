import React from 'react';
import { WSCodeLogo } from '@/components/common/WSCodeLogo';
import styles from './AgentPanel.module.css';

interface EmptyStateProps {
    onSuggestionClick: (suggestion: string) => void;
}

/**
 * Empty state displayed when there are no messages in the chat
 */
export function EmptyState({ onSuggestionClick }: EmptyStateProps) {
    return (
        <div className={styles.emptyState}>
            <WSCodeLogo
                size={48}
                className={styles.emptyIcon}
            />
            <h3>どのようなお手伝いができますか？</h3>
            <p>ドキュメントの作成、編集、レビューをお手伝いします。</p>
            <div className={styles.suggestions}>
                <button
                    className={styles.suggestion}
                    onClick={() => onSuggestionClick('この契約書の潜在的な問題をレビューしてください')}
                >
                    契約書のレビュー
                </button>
                <button
                    className={styles.suggestion}
                    onClick={() => onSuggestionClick('わかりやすくなるように改善案を提示してください')}
                >
                    文章の改善
                </button>
                <button
                    className={styles.suggestion}
                    onClick={() => onSuggestionClick('〜についての新しいセクションを作成してください')}
                >
                    セクションの追加
                </button>
            </div>
        </div>
    );
}
