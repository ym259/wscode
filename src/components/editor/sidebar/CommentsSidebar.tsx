'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Editor } from '@tiptap/react';

interface Comment {
    id: string;
    author: string;
    date: string;
    content: string;
}

interface CommentPosition {
    id: string;
    top: number;
}

interface CommentsSidebarProps {
    comments: Comment[];
    editor: Editor | null;
    onDeleteComment?: (commentId: string) => void;
}

/**
 * Sidebar displaying document comments aligned with their corresponding text
 * Comments are positioned to match the vertical position of the highlighted text
 * When multiple comments overlap or are close together, they stack with spacing
 */
export const CommentsSidebar: React.FC<CommentsSidebarProps> = ({ comments, editor, onDeleteComment }) => {
    const [commentPositions, setCommentPositions] = useState<CommentPosition[]>([]);
    const sidebarRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Calculate positions of comments based on their highlighted text in the editor
    const calculatePositions = useCallback(() => {
        if (!editor || !sidebarRef.current) return;

        const editorElement = editor.view.dom;


        // Get the scrollable container (the editor's scroll container)
        const editorScrollContainer = editorElement.closest('[style*="overflow"]') || editorElement.parentElement;
        if (!editorScrollContainer) return;


        const containerRect = editorScrollContainer.getBoundingClientRect();

        const positions: CommentPosition[] = [];
        const MIN_GAP = 100; // Minimum gap between stacked comments (card height + margin)

        comments.forEach((comment) => {
            // Find the highlighted element for this comment
            const highlightElement = editorElement.querySelector(
                `[data-comment-id="${comment.id}"]`
            ) as HTMLElement | null;

            if (highlightElement) {
                const highlightRect = highlightElement.getBoundingClientRect();
                // Calculate position relative to the sidebar's scroll container
                // Account for any scrolling in the editor
                let targetTop = highlightRect.top - containerRect.top;

                // Check for overlap with previous comments and stack if needed
                for (const prevPos of positions) {
                    const gap = targetTop - prevPos.top;
                    if (gap >= 0 && gap < MIN_GAP) {
                        // This comment would overlap with a previous one, push it down
                        targetTop = prevPos.top + MIN_GAP;
                    }
                }

                positions.push({
                    id: comment.id,
                    top: targetTop,
                });
            }
        });

        setCommentPositions(positions);
    }, [comments, editor]);

    // Recalculate positions when comments change, editor updates, or window resizes
    // Use useLayoutEffect to prevent visual jitter
    React.useLayoutEffect(() => {
        calculatePositions();

        // Recalculate on scroll
        const editorElement = editor?.view.dom;
        const scrollContainer = editorElement?.closest('[style*="overflow"]') || editorElement?.parentElement;

        const handleScroll = () => calculatePositions();
        const handleResize = () => calculatePositions();

        scrollContainer?.addEventListener('scroll', handleScroll);
        window.addEventListener('resize', handleResize);

        // Also recalculate when editor content changes
        const observer = new MutationObserver(() => {
            requestAnimationFrame(calculatePositions);
        });

        if (editorElement) {
            observer.observe(editorElement, {
                childList: true,
                subtree: true,
                attributes: true,
            });
        }

        return () => {
            scrollContainer?.removeEventListener('scroll', handleScroll);
            window.removeEventListener('resize', handleResize);
            observer.disconnect();
        };
    }, [calculatePositions, editor]);

    if (comments.length === 0) return null;

    return (
        <div
            ref={sidebarRef}
            style={{
                width: '280px',
                flexShrink: 0,
                borderLeft: '1px solid #e1dfdd',
                backgroundColor: '#faf9f8',
                overflow: 'visible',
                position: 'relative',
            }}
        >
            <div style={{
                padding: '8px 12px',
                fontSize: '13px',
                fontWeight: 600,
                color: '#323130',
                borderBottom: '1px solid #e1dfdd',
                backgroundColor: '#faf9f8',
                position: 'sticky',
                top: 0,
                zIndex: 10,
            }}>
                Comments ({comments.length})
            </div>
            <div
                ref={containerRef}
                style={{
                    position: 'relative',
                    minHeight: '100%',
                }}
            >
                {comments.map((comment) => {
                    const position = commentPositions.find(p => p.id === comment.id);
                    const topValue = position?.top ?? 0;

                    return (
                        <div
                            key={comment.id}
                            data-comment-card-id={comment.id}
                            style={{
                                position: 'absolute',
                                top: `${topValue}px`,
                                left: '8px',
                                right: '8px',
                                backgroundColor: '#ffffff',
                                border: '1px solid #e1dfdd',
                                borderRadius: '4px',
                                padding: '12px',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                transition: 'top 0.15s ease-out',
                            }}
                        >
                            {/* Comment bubble pointer */}
                            <div style={{
                                position: 'absolute',
                                left: '-8px',
                                top: '12px',
                                width: '0',
                                height: '0',
                                borderTop: '6px solid transparent',
                                borderBottom: '6px solid transparent',
                                borderRight: '8px solid #e1dfdd',
                            }} />
                            <div style={{
                                position: 'absolute',
                                left: '-6px',
                                top: '12px',
                                width: '0',
                                height: '0',
                                borderTop: '6px solid transparent',
                                borderBottom: '6px solid transparent',
                                borderRight: '8px solid #ffffff',
                            }} />

                            {/* Delete button */}
                            {onDeleteComment && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDeleteComment(comment.id);
                                    }}
                                    style={{
                                        position: 'absolute',
                                        top: '8px',
                                        right: '8px',
                                        width: '20px',
                                        height: '20px',
                                        padding: 0,
                                        border: 'none',
                                        backgroundColor: 'transparent',
                                        color: '#a19f9d',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '16px',
                                        lineHeight: 1,
                                        borderRadius: '4px',
                                        transition: 'background-color 0.15s, color 0.15s',
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = '#f3f2f1';
                                        e.currentTarget.style.color = '#605e5c';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = 'transparent';
                                        e.currentTarget.style.color = '#a19f9d';
                                    }}
                                    title="Delete comment"
                                >
                                    ×
                                </button>
                            )}

                            {/* Author and date */}
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                marginBottom: '8px',
                            }}>
                                <div style={{
                                    width: '24px',
                                    height: '24px',
                                    borderRadius: '50%',
                                    backgroundColor: '#0078d4',
                                    color: '#ffffff',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    marginRight: '8px',
                                }}>
                                    {comment.author.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <div style={{
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        color: '#323130',
                                    }}>
                                        {comment.author}
                                    </div>
                                    {comment.date && (
                                        <div style={{
                                            fontSize: '10px',
                                            color: '#605e5c',
                                        }}>
                                            {new Date(comment.date).toLocaleDateString()}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Comment content */}
                            <div style={{
                                fontSize: '12px',
                                color: '#323130',
                                lineHeight: 1.4,
                                whiteSpace: 'pre-wrap',
                            }}>
                                {comment.content || '(No content)'}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
