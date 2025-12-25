'use client';

import React, { useState, forwardRef } from 'react';

import { EditorToolbar } from '../toolbar/EditorToolbar';
import { CommentsSidebar } from '../sidebar/CommentsSidebar';
import { TrackChangePopup } from '../popups/TrackChangePopup';
import { SelectionPopover, CommentInputPopover } from '../popups/SelectionPopover';
import { PagedEditorContent } from './PagedEditorContent';

import '../CustomDocEditor.css';
import { CustomDocEditorHandle, CustomDocEditorProps, Comment, TrackChangesDisplayMode } from './types';
import { useCustomEditor, useEditorHandle } from './use-custom-editor';
import { useDocxLoader } from './use-docx-loader';
import { useTrackChanges } from './use-track-changes';
import { useComments } from './use-comments';
import { Ruler } from './Ruler';

export type { CustomDocEditorHandle, TrackChangesDisplayMode };

export const CustomDocEditor = forwardRef<CustomDocEditorHandle, CustomDocEditorProps>(({ file }, ref) => {
    const [comments, setComments] = useState<Comment[]>([]);
    const [showRuler, setShowRuler] = useState(true);
    const [docAttrs, setDocAttrs] = useState<any>(null);
    const [trackChangesDisplayMode, setTrackChangesDisplayMode] = useState<TrackChangesDisplayMode>('markup');
    const [selectionUpdateKey, setSelectionUpdateKey] = useState(0);

    // 1. Initialize Editor
    const editor = useCustomEditor({
        setSelectionUpdateKey,
        setComments,
        comments,
        docAttrs
    });

    // 2. Expose Handle
    useEditorHandle(ref, editor, docAttrs, comments, setComments, setDocAttrs);

    // 3. Load DOCX
    const { isLoading } = useDocxLoader({
        file,
        editor,
        setDocAttrs,
        setComments
    });

    // 4. Handle Track Changes
    const {
        trackChangePopup,
        setTrackChangePopup,
        handleAcceptChange,
        handleRejectChange
    } = useTrackChanges({ editor });

    // 5. Handle Comments
    const {
        selectionPopover,
        setSelectionPopover,
        commentInputPopover,
        handleDeleteComment,
        handleShowCommentInput,
        handleAddComment,
        handleCancelCommentInput
    } = useComments({ editor, setComments });

    // Image upload handler
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const uploadedFile = e.target.files?.[0];
        if (uploadedFile) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const result = event.target?.result as string;
                if (result) {
                    editor?.chain().focus().setImage({ src: result }).run();
                }
            };
            reader.readAsDataURL(uploadedFile);
        }
        e.target.value = '';
    };

    // Page layout change handler
    const handlePageLayoutChange = (updates: {
        pageSize?: { width: number; height: number };
        pageMargins?: { top: number; right: number; bottom: number; left: number };
    }) => {
        setDocAttrs((prev: any) => {
            const newAttrs = { ...prev };
            if (updates.pageSize) {
                newAttrs.pageSize = {
                    ...prev?.pageSize,
                    'w:w': updates.pageSize.width,
                    'w:h': updates.pageSize.height,
                };
            }
            if (updates.pageMargins) {
                newAttrs.pageMargins = {
                    ...prev?.pageMargins,
                    'w:top': updates.pageMargins.top,
                    'w:right': updates.pageMargins.right,
                    'w:bottom': updates.pageMargins.bottom,
                    'w:left': updates.pageMargins.left,
                };
            }
            console.log('[CustomDocEditor] Page layout updated:', newAttrs);
            return newAttrs;
        });
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            backgroundColor: '#f3f2f1',
        }}>
            <EditorToolbar
                key={selectionUpdateKey}
                editor={editor}
                showRuler={showRuler}
                onToggleRuler={() => setShowRuler(!showRuler)}
                onImageUpload={handleImageUpload}
                trackChangesDisplayMode={trackChangesDisplayMode}
                onTrackChangesDisplayModeChange={setTrackChangesDisplayMode}
                docAttrs={docAttrs}
                onPageLayoutChange={handlePageLayoutChange}
            />

            <div style={{
                flexGrow: 1,
                display: 'flex',
                overflow: 'hidden',
                backgroundColor: '#f3f2f1',
            }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <Ruler showRuler={showRuler} />

                    <div
                        style={{
                            flex: 1,
                            overflow: 'auto',
                            padding: '8px',
                            cursor: 'text',
                        }}
                        onClick={() => editor?.chain().focus().run()}
                    >
                        {isLoading ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                                <div className="editorSpinner" />
                                <span style={{ marginLeft: '12px', color: '#4b5563', fontWeight: 500 }}>Loading document...</span>
                            </div>
                        ) : (
                            <div onClick={(e) => e.stopPropagation()}>
                                <PagedEditorContent
                                    editor={editor}
                                    docAttrs={docAttrs}
                                    trackChangesDisplayMode={trackChangesDisplayMode}
                                    isPaged={process.env.NEXT_PUBLIC_DISABLE_PAGED_VIEW !== 'true'}
                                />
                            </div>
                        )}
                    </div>
                </div>

                <CommentsSidebar comments={comments} editor={editor} onDeleteComment={handleDeleteComment} />
            </div>

            <TrackChangePopup
                data={trackChangePopup}
                onAccept={handleAcceptChange}
                onReject={handleRejectChange}
                onClose={() => setTrackChangePopup(null)}
            />

            <SelectionPopover
                visible={selectionPopover.visible}
                x={selectionPopover.x}
                y={selectionPopover.y}
                onAddComment={handleShowCommentInput}
                onClose={() => setSelectionPopover({ visible: false, x: 0, y: 0 })}
            />

            <CommentInputPopover
                visible={commentInputPopover.visible}
                x={commentInputPopover.x}
                y={commentInputPopover.y}
                onSubmit={handleAddComment}
                onCancel={handleCancelCommentInput}
            />
        </div>
    );
});

CustomDocEditor.displayName = 'CustomDocEditor';
