
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';
import styles from './AIChatBar.module.css';

interface AIChatBarProps {
    onAction: (prompt: string) => Promise<void>;
    isProcessing: boolean;
}

export default function AIChatBar({ onAction, isProcessing }: AIChatBarProps) {
    const [prompt, setPrompt] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!prompt.trim() || isProcessing) return;

        setError(null);
        try {
            await onAction(prompt);
            setPrompt('');
        } catch (err) {
            setError('Failed to process request. Please try again.');
            console.error(err);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    // Auto-focus on mount
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    return (
        <div className={styles.container}>
            {error && <div className={styles.error}>{error}</div>}
            <div className={styles.inputWrapper}>
                <input
                    ref={inputRef}
                    type="text"
                    className={styles.input}
                    placeholder="Ask AI to edit this document..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isProcessing}
                />
                <button
                    className={styles.button}
                    onClick={() => handleSubmit()}
                    disabled={!prompt.trim() || isProcessing}
                >
                    {isProcessing ? (
                        <div className={styles.spinner} />
                    ) : (
                        <ArrowUp size={20} />
                    )}
                </button>
            </div>
        </div>
    );
}
