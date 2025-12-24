'use client';

import React from 'react';

export interface TrackChangePopupData {
    visible: boolean;
    x: number;
    y: number;
    type: 'insertion' | 'deletion';
    author: string;
    date: string;
    content: string;
    comment?: string;
    element: HTMLElement | null;
}

interface TrackChangePopupProps {
    data: TrackChangePopupData | null;
    onAccept: () => void;
    onReject: () => void;
    onClose: () => void;
}

/**
 * Popup for accepting/rejecting track changes
 */
export const TrackChangePopup: React.FC<TrackChangePopupProps> = ({
    data,
    onAccept,
    onReject,
    onClose,
}) => {
    if (!data) return null;

    return (
        <div
            style={{
                position: 'fixed',
                left: `${data.x}px`,
                top: `${data.y}px`,
                backgroundColor: '#2b2b2b',
                color: '#ffffff',
                borderRadius: '6px',
                padding: '12px 16px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                zIndex: 9999,
                maxWidth: '350px',
                minWidth: '200px',
            }}
            onClick={(e) => e.stopPropagation()}
        >
            {/* Header with accept/reject buttons */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px',
                paddingBottom: '8px',
                borderBottom: '1px solid #444',
            }}>
                <span style={{ fontSize: '12px', color: '#888' }}>
                    提案を受け入れるか拒否しますか?
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={() => {
                            onAccept();
                            onClose();
                        }}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: '#4caf50',
                            cursor: 'pointer',
                            fontSize: '18px',
                            padding: '4px',
                        }}
                        title="Accept"
                    >
                        ✓
                    </button>
                    <button
                        onClick={() => {
                            onReject();
                            onClose();
                        }}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: '#f44336',
                            cursor: 'pointer',
                            fontSize: '18px',
                            padding: '4px',
                        }}
                        title="Reject"
                    >
                        ✕
                    </button>
                </div>
            </div>

            {/* Author info */}
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    backgroundColor: data.type === 'insertion' ? '#9c27b0' : '#f44336',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 600,
                    marginRight: '10px',
                }}>
                    #
                </div>
                <div>
                    <div style={{ fontWeight: 600, fontSize: '13px' }}>
                        {data.author}
                    </div>
                    <div style={{ fontSize: '11px', color: '#aaa' }}>
                        {data.comment ? (
                            <span style={{ color: '#FFC107', fontStyle: 'italic' }}>{data.comment}</span>
                        ) : (
                            `${data.type === 'insertion' ? '追加しました' : '削除しました'}: ${data.content}`
                        )}
                    </div>
                </div>
            </div>

            {/* Date */}
            {data.date && (
                <div style={{ fontSize: '11px', color: '#888' }}>
                    {new Date(data.date).toLocaleString('ja-JP')}
                </div>
            )}
        </div>
    );
};
