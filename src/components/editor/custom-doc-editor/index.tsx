'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useState, forwardRef, useEffect } from 'react';
import JSZip from 'jszip';

import { useWorkspace } from '@/contexts/WorkspaceContext';
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
import { useOutline } from './use-outline';
import { Ruler } from './Ruler';

export type { CustomDocEditorHandle, TrackChangesDisplayMode };

export const CustomDocEditor = forwardRef<CustomDocEditorHandle, CustomDocEditorProps>(({ file, fileName }, ref) => {
    const { setAttachedSelection, requestComposerFocus, scrollToPositionRequest, setScrollToPositionRequest } = useWorkspace();
    const [comments, setComments] = useState<Comment[]>([]);
    const [showRuler, setShowRuler] = useState(true);
    const [docAttrs, setDocAttrs] = useState<any>(null);
    const [trackChangesDisplayMode, setTrackChangesDisplayMode] = useState<TrackChangesDisplayMode>('markup');
    const [selectionUpdateKey, setSelectionUpdateKey] = useState(0);
    const [originalZip, setOriginalZip] = useState<JSZip | null>(null);
    const [pageCount, setPageCount] = useState(1);
    const [visualLineCount, setVisualLineCount] = useState(0);

    const [showComments, setShowComments] = useState(true);

    // 1. Initialize Editor
    const editor = useCustomEditor({
        setSelectionUpdateKey
    });

    // 2. Expose Handle
    useEditorHandle(ref, editor, docAttrs, comments, setComments, setDocAttrs, originalZip, pageCount, visualLineCount);

    // 3. Load DOCX
    const { isLoading } = useDocxLoader({
        file,
        editor,
        setDocAttrs,
        setComments,
        setOriginalZip
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

    // 6. Handle Outline & Navigation
    useOutline({ editor });

    // 7. Handle Scroll to Position Requests (from AI search results)
    useEffect(() => {
        if (!editor || scrollToPositionRequest === null) return;

        const docSize = editor.state.doc.content.size;
        const safePos = Math.max(0, Math.min(scrollToPositionRequest, docSize - 1));
        
        // Find the DOM node at this position first
        let targetElement: HTMLElement | null = null;
        try {
            const domAtPos = editor.view.domAtPos(safePos);
            if (domAtPos && domAtPos.node) {
                // Get the element (text nodes don't have classList)
                if (domAtPos.node.nodeType === Node.TEXT_NODE) {
                    targetElement = domAtPos.node.parentElement;
                } else {
                    targetElement = domAtPos.node as HTMLElement;
                }
                
                // Find the closest block-level parent for better highlighting
                const blockTags = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'TABLE', 'TR'];
                while (targetElement && !blockTags.includes(targetElement.tagName)) {
                    targetElement = targetElement.parentElement;
                }
            }
        } catch (e) {
            console.warn('[ScrollToPosition] Failed to find DOM element:', e);
        }

        // Set text selection
        editor.chain()
            .focus()
            .setTextSelection(safePos)
            .run();

        // Scroll the target element to center with highlight
        if (targetElement) {
            // Use requestAnimationFrame to ensure DOM is ready
            requestAnimationFrame(() => {
                // Scroll to center
                targetElement!.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });

                // Apply highlight using inline styles (more reliable than CSS class)
                const originalBackground = targetElement!.style.backgroundColor;
                const originalOutline = targetElement!.style.outline;
                const originalTransition = targetElement!.style.transition;
                const originalBorderRadius = targetElement!.style.borderRadius;
                
                // Set highlight styles
                targetElement!.style.transition = 'background-color 0.3s ease, outline 0.3s ease';
                targetElement!.style.backgroundColor = 'rgba(250, 204, 21, 0.5)';
                targetElement!.style.outline = '3px solid rgba(250, 204, 21, 0.8)';
                targetElement!.style.borderRadius = '4px';
                
                // Fade out after 2 seconds
                setTimeout(() => {
                    if (targetElement) {
                        targetElement.style.backgroundColor = 'rgba(250, 204, 21, 0.2)';
                        targetElement.style.outline = '2px solid rgba(250, 204, 21, 0.4)';
                    }
                }, 2000);
                
                // Remove highlight after 3 seconds
                setTimeout(() => {
                    if (targetElement) {
                        targetElement.style.backgroundColor = originalBackground;
                        targetElement.style.outline = originalOutline;
                        targetElement.style.transition = originalTransition;
                        targetElement.style.borderRadius = originalBorderRadius;
                    }
                }, 3000);
            });
        } else {
            // Fallback: just use editor's scrollIntoView
            editor.chain()
                .setTextSelection(safePos)
                .scrollIntoView()
                .run();
        }

        // Clear the request
        setScrollToPositionRequest(null);
    }, [editor, scrollToPositionRequest, setScrollToPositionRequest]);

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

    // AI Attach Handler
    const handleAiAttach = () => {
        if (!editor || !fileName) return;

        const { state } = editor;
        const { selection } = state;
        const { from, to } = selection;

        if (from !== to) {
            const selectedText = state.doc.textBetween(from, to, ' ');
            if (selectedText.trim()) {
                setAttachedSelection({
                    text: selectedText,
                    fileName: fileName,
                });
                // Close selection popover
                setSelectionPopover({ visible: false, x: 0, y: 0 });
            }
        } else {
            // No selection - just focus composer
            requestComposerFocus();
        }
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
                showComments={showComments}
                onToggleComments={() => setShowComments(!showComments)}
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
                                    onLayoutStatsChange={({ pageCount, visualLineCount }) => {
                                        setPageCount(pageCount);
                                        setVisualLineCount(visualLineCount);
                                    }}
                                />
                            </div>
                        )}
                    </div>
                </div>

                {showComments && comments.length > 0 && (
                    <CommentsSidebar
                        comments={comments}
                        editor={editor}
                        onDeleteComment={handleDeleteComment}
                        onCollapse={() => setShowComments(false)}
                    />
                )}
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
                onAiAttach={handleAiAttach}
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
