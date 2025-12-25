'use client';

import React, { useState, useEffect, useRef } from 'react';
import { MessageSquarePlus } from 'lucide-react';

interface SelectionPopoverProps {
    visible: boolean;
    x: number;
    y: number;
    onAddComment: () => void;
    onClose: () => void;
}

/**
 * Popover that appears when text is selected in the editor.
 * Shows options like adding a comment.
 */
export const SelectionPopover: React.FC<SelectionPopoverProps> = ({
    visible,
    x,
    y,
    onAddComment,
}) => {
    if (!visible) return null;

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
                style={{
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
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f3f2f1';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                }}
                title="Add comment"
            >
                <MessageSquarePlus size={16} />
                Comment
            </button>
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
                Add Comment
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
                    Cancel
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
                    Add
                </button>
            </div>
        </div>
    );
};
