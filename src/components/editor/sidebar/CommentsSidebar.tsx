'use client';

import React from 'react';

interface Comment {
    id: string;
    author: string;
    date: string;
    content: string;
}

interface CommentsSidebarProps {
    comments: Comment[];
}

/**
 * Sidebar displaying document comments
 */
export const CommentsSidebar: React.FC<CommentsSidebarProps> = ({ comments }) => {
    if (comments.length === 0) return null;

    return (
        <div
            style={{
                width: '280px',
                flexShrink: 0,
                borderLeft: '1px solid #e1dfdd',
                backgroundColor: '#faf9f8',
                overflow: 'auto',
                padding: '8px',
            }}
        >
            <div style={{
                padding: '8px 12px',
                fontSize: '13px',
                fontWeight: 600,
                color: '#323130',
                borderBottom: '1px solid #e1dfdd',
                marginBottom: '8px',
            }}>
                Comments ({comments.length})
            </div>
            {comments.map((comment) => (
                <div
                    key={comment.id}
                    style={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #e1dfdd',
                        borderRadius: '4px',
                        padding: '12px',
                        marginBottom: '8px',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                        position: 'relative',
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
            ))}
        </div>
    );
};
