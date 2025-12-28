'use client';

import React, { useEffect, useState } from 'react';
import { Editor } from '@tiptap/core';
import { trackChangesHelpers } from '@harbour-enterprises/superdoc';
import { useWorkspace } from '@/contexts/WorkspaceContext';

interface TrackChangesToolbarProps {
    editor: Editor | null;
}

export function TrackChangesToolbar({ editor }: TrackChangesToolbarProps) {
    const [changeCount, setChangeCount] = useState(0);
    const { isOverwriteEnabled, setIsOverwriteEnabled } = useWorkspace();

    useEffect(() => {
        if (editor) {
            console.log('TrackChangesToolbar: editor commands:', Object.keys(editor.commands).filter(cmd => cmd.toLowerCase().includes('change')));
            console.log('TrackChangesToolbar: trackChangesHelpers keys:', Object.keys(trackChangesHelpers));
        }
    }, [editor]);


    useEffect(() => {
        if (!editor) return;

        const updateCount = () => {
            const changes = trackChangesHelpers.getAllChanges(editor.state);
            setChangeCount(changes.length);
        };

        // Update on mount
        updateCount();

        // Subscribe to updates
        editor.on('update', updateCount);
        editor.on('selectionUpdate', updateCount);
        editor.on('transaction', updateCount);

        return () => {
            editor.off('update', updateCount);
            editor.off('selectionUpdate', updateCount);
            editor.off('transaction', updateCount);
        };
    }, [editor]);

    if (!editor) return null;

    return (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-white text-sm">
            <div className="flex items-center gap-1 mr-4">
                <span className="font-medium text-gray-700">Track Changes:</span>
                <span className="bg-gray-100 px-2 py-0.5 rounded-full text-xs font-semibold text-gray-600">
                    {changeCount}
                </span>
            </div>

            <div className="h-4 w-px bg-gray-300 mx-2" />

            <div className="flex items-center gap-1">
                <button
                    onClick={() => {
                        console.log('Executing goToPreviousChange');
                        editor.commands.goToPreviousChange();
                    }}
                    className="p-1.5 hover:bg-gray-100 rounded text-gray-600 disabled:opacity-50"
                    title="Previous Change"
                >
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                <button
                    onClick={() => {
                        console.log('Executing goToNextChange');
                        editor.commands.goToNextChange();
                    }}
                    className="p-1.5 hover:bg-gray-100 rounded text-gray-600 disabled:opacity-50"
                    title="Next Change"
                >
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                </button>
            </div>

            <div className="h-4 w-px bg-gray-300 mx-2" />

            <div className="flex items-center gap-2">
                <button
                    onClick={() => {
                        console.log('Executing acceptChange');
                        const result = editor.commands.acceptChange();
                        console.log('acceptChange result:', result);
                    }}
                    disabled={changeCount === 0}
                    className="flex items-center gap-1 px-2 py-1 hover:bg-green-50 text-green-700 rounded transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
                    title="Accept Current Change"
                >
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Accept
                </button>
                <button
                    onClick={() => {
                        console.log('Executing rejectChange');
                        const result = editor.commands.rejectChange();
                        console.log('rejectChange result:', result);
                    }}
                    disabled={changeCount === 0}
                    className="flex items-center gap-1 px-2 py-1 hover:bg-red-50 text-red-700 rounded transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
                    title="Reject Current Change"
                >
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Reject
                </button>
            </div>

            <div className="ml-auto flex items-center gap-2">
                <button
                    onClick={() => editor.commands.acceptAllChanges()}
                    disabled={changeCount === 0}
                    className="text-xs text-gray-500 hover:text-green-700 hover:bg-green-50 px-2 py-1 rounded transition-colors disabled:opacity-30"
                >
                    Accept All
                </button>
                <button
                    onClick={() => editor.commands.rejectAllChanges()}
                    disabled={changeCount === 0}
                    className="text-xs text-gray-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition-colors disabled:opacity-30"
                >
                    Reject All
                </button>
            </div>

            <div className="h-4 w-px bg-gray-300 mx-2" />

            {/* Overwrite Toggle */}
            <button
                onClick={() => setIsOverwriteEnabled(!isOverwriteEnabled)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    border: '1px solid',
                    borderColor: isOverwriteEnabled ? '#2b579a' : '#e5e7eb',
                    backgroundColor: isOverwriteEnabled ? '#f0f7ff' : '#ffffff',
                    color: isOverwriteEnabled ? '#2b579a' : '#4b5563',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.1s',
                }}
            >
                <div style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '2px',
                    border: '1px solid',
                    borderColor: isOverwriteEnabled ? '#2b579a' : '#d1d5db',
                    backgroundColor: isOverwriteEnabled ? '#2b579a' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    {isOverwriteEnabled && (
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                    )}
                </div>
                上書き保存
            </button>
        </div>
    );
}
