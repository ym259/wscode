'use client';

import React, { useState, useEffect, useRef } from 'react';
import { MessageSquarePlus, Sparkles } from 'lucide-react';

interface SelectionPopoverProps {
    visible: boolean;
    x: number;
    y: number;
    onAddComment: () => void;
    onAiAttach?: () => void;
    onClose: () => void;
}

/**
 * Popover that appears when text is selected in the editor.
 * Shows options like adding a comment or attaching to AI chat.
 */
export const SelectionPopover: React.FC<SelectionPopoverProps> = ({
    visible,
    x,
    y,
    onAddComment,
    onAiAttach,
}) => {
    if (!visible) return null;

    const buttonStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 10px',
        backgroundColor: 'transparent',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '13px',
        color: '#323130',
        transition: 'background-color 0.15s',
        whiteSpace: 'nowrap',
    };

    const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.style.backgroundColor = '#f3f2f1';
    };

    const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.style.backgroundColor = 'transparent';
    };

    return (
        <div
            style={{
                position: 'fixed',
                left: `${x}px`,
                top: `${y}px`,
                transform: 'translateX(-50%)',
                zIndex: 1000,
                display: 'flex',
                gap: '4px',
                backgroundColor: '#ffffff',
                border: '1px solid #e1dfdd',
                borderRadius: '6px',
                padding: '4px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            }}
            data-selection-popover
            onMouseDown={(e) => e.preventDefault()} // Prevent losing selection
        >
            <button
                onClick={() => {
                    onAddComment();
                }}
                style={buttonStyle}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                title="Add comment"
            >
                <MessageSquarePlus size={16} />
                コメント
            </button>
            {onAiAttach && (
                <button
                    onClick={() => {
                        onAiAttach();
                    }}
                    style={buttonStyle}
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                    title="Attach selection to AI chat (⌘/)"
                >
                    <Sparkles size={16} />
                    <span>AI添付</span>
                    <span style={{ color: '#a19f9d', fontSize: '11px' }}>⌘/</span>
                </button>
            )}
        </div>
    );
};

interface CommentInputPopoverProps {
    visible: boolean;
    x: number;
    y: number;
    onSubmit: (content: string) => void;
    onCancel: () => void;
}

/**
 * Popover with an input field for entering comment text.
 */
export const CommentInputPopover: React.FC<CommentInputPopoverProps> = ({
    visible,
    x,
    y,
    onSubmit,
    onCancel,
}) => {
    const [comment, setComment] = useState('');
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (visible && inputRef.current) {
            inputRef.current.focus();
        }
    }, [visible]);

    useEffect(() => {
        if (!visible) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setComment((prev) => (prev !== '' ? '' : prev));
        }
    }, [visible]);

    const handleSubmit = () => {
        if (comment.trim()) {
            onSubmit(comment.trim());
            setComment('');
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        } else if (e.key === 'Escape') {
            onCancel();
        }
    };

    if (!visible) return null;

    return (
        <div
            style={{
                position: 'fixed',
                left: `${x}px`,
                top: `${y}px`,
                zIndex: 1000,
                backgroundColor: '#ffffff',
                border: '1px solid #e1dfdd',
                borderRadius: '8px',
                padding: '12px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                width: '280px',
            }}
            data-comment-input-popover
            onMouseDown={(e) => e.stopPropagation()}
        >
            <div style={{
                fontSize: '13px',
                fontWeight: 600,
                color: '#323130',
                marginBottom: '8px',
            }}>
                コメントを追加
            </div>
            <textarea
                ref={inputRef}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter your comment..."
                style={{
                    width: '100%',
                    minHeight: '60px',
                    padding: '8px',
                    border: '1px solid #e1dfdd',
                    borderRadius: '4px',
                    fontSize: '13px',
                    resize: 'vertical',
                    outline: 'none',
                    fontFamily: 'inherit',
                    backgroundColor: '#ffffff',
                    color: '#323130',
                    boxSizing: 'border-box',
                }}
                onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#0078d4';
                }}
                onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#e1dfdd';
                }}
            />
            <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px',
                marginTop: '8px',
            }}>
                <button
                    onClick={onCancel}
                    style={{
                        padding: '6px 12px',
                        backgroundColor: 'transparent',
                        border: '1px solid #e1dfdd',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        color: '#605e5c',
                    }}
                >
                    キャンセル
                </button>
                <button
                    onClick={handleSubmit}
                    disabled={!comment.trim()}
                    style={{
                        padding: '6px 12px',
                        backgroundColor: comment.trim() ? '#0078d4' : '#f3f2f1',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: comment.trim() ? 'pointer' : 'default',
                        fontSize: '13px',
                        color: comment.trim() ? '#ffffff' : '#a19f9d',
                        fontWeight: 500,
                    }}
                >
                    追加
                </button>
            </div>
        </div>
    );
};
