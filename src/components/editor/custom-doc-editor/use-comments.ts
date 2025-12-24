import { useState, useCallback, useRef, useEffect, Dispatch, SetStateAction } from 'react';
import { Editor } from '@tiptap/react';
import { Comment } from './types';

interface UseCommentsProps {
    editor: Editor | null;
    setComments: Dispatch<SetStateAction<Comment[]>>;
}

export const useComments = ({ editor, setComments }: UseCommentsProps) => {
    const [selectionPopover, setSelectionPopover] = useState<{ visible: boolean; x: number; y: number }>({ visible: false, x: 0, y: 0 });
    const [commentInputPopover, setCommentInputPopover] = useState<{ visible: boolean; x: number; y: number }>({ visible: false, x: 0, y: 0 });
    const savedSelectionRef = useRef<{ from: number; to: number } | null>(null);

    // Delete comment handler
    const handleDeleteComment = (commentId: string) => {
        if (!editor) return;

        const { state } = editor;
        const tr = state.tr;
        const commentMark = state.schema.marks.comment;

        if (!commentMark) return;

        // Find all ranges with this comment and remove the mark
        const rangesToClear: { from: number; to: number }[] = [];

        state.doc.descendants((node, pos) => {
            if (node.isText) {
                node.marks.forEach((mark) => {
                    if (mark.type.name === 'comment' && mark.attrs.commentId === commentId) {
                        rangesToClear.push({ from: pos, to: pos + node.nodeSize });
                    }
                });
            }
            return true;
        });

        // Remove comment marks from all found ranges
        rangesToClear.forEach(({ from, to }) => {
            tr.removeMark(from, to, commentMark);
        });

        if (rangesToClear.length > 0) {
            editor.view.dispatch(tr);
            // Update comments state
            setComments(prev => prev.filter(c => c.id !== commentId));
        }
    };

    // Show comment input handler
    const handleShowCommentInput = useCallback(() => {
        if (!editor) return;

        const { selection } = editor.state;
        const { from, to } = selection;

        if (from === to) return; // No selection

        // Save the selection range
        savedSelectionRef.current = { from, to };

        // Get position for comment input popover
        const view = editor.view;
        const coords = view.coordsAtPos(to);

        setSelectionPopover({ visible: false, x: 0, y: 0 });
        setCommentInputPopover({ visible: true, x: coords.left, y: coords.bottom + 10 });
    }, [editor]);

    // Add comment handler
    const handleAddComment = useCallback((content: string) => {
        if (!editor || !savedSelectionRef.current) return;

        const { from, to } = savedSelectionRef.current;
        const commentId = Math.random().toString(36).substr(2, 9);
        const author = 'User'; // Could be made dynamic
        const date = new Date().toISOString();

        // Add the comment mark to the selected text
        editor.chain()
            .focus()
            .setTextSelection({ from, to })
            .setMark('comment', { commentId, author, date, content })
            .run();

        // Add to comments state
        setComments(prev => [...prev, {
            id: commentId,
            author,
            date,
            content,
        }]);

        // Clean up
        savedSelectionRef.current = null;
        setCommentInputPopover({ visible: false, x: 0, y: 0 });
    }, [editor, setComments]);

    // Cancel comment input handler
    const handleCancelCommentInput = useCallback(() => {
        savedSelectionRef.current = null;
        setCommentInputPopover({ visible: false, x: 0, y: 0 });
    }, []);

    // Handle clicking outside popovers
    useEffect(() => {
        const handleDocumentClick = (event: MouseEvent) => {
            const target = event.target as HTMLElement;

            // Close selection popover if clicking outside
            if (selectionPopover.visible) {
                const popoverElement = document.querySelector('[data-selection-popover]');
                if (popoverElement && !popoverElement.contains(target)) {
                    setSelectionPopover({ visible: false, x: 0, y: 0 });
                }
            }

            // Close comment input popover if clicking outside
            if (commentInputPopover.visible) {
                const inputPopoverElement = document.querySelector('[data-comment-input-popover]');
                if (inputPopoverElement && !inputPopoverElement.contains(target)) {
                    setCommentInputPopover({ visible: false, x: 0, y: 0 });
                    savedSelectionRef.current = null;
                }
            }
        };

        const handleScroll = () => {
            setSelectionPopover({ visible: false, x: 0, y: 0 });
        };

        document.addEventListener('click', handleDocumentClick);
        window.addEventListener('scroll', handleScroll, true);

        return () => {
            document.removeEventListener('click', handleDocumentClick);
            window.removeEventListener('scroll', handleScroll, true);
        };
    }, [selectionPopover.visible, commentInputPopover.visible]);

    // Handle selection changes - show popover when text is selected (on mouseup)
    useEffect(() => {
        if (!editor) return;

        const editorElement = editor.view.dom;

        const handleMouseUp = () => {
            // Small delay to ensure selection is finalized
            setTimeout(() => {
                if (!editor) return;

                const { state } = editor;
                const { selection } = state;
                const { from, to } = selection;

                // Only show popover if there's actual text selected (not just cursor)
                if (from !== to && !commentInputPopover.visible) {
                    // Get the DOM range to position the popover
                    const view = editor.view;
                    const start = view.coordsAtPos(from);
                    const end = view.coordsAtPos(to);

                    // Position the popover above the selection, centered
                    const x = (start.left + end.left) / 2;
                    // Position above the selection with enough space for the popover
                    const y = Math.min(start.top, end.top) - 45;

                    setSelectionPopover({ visible: true, x, y });
                }
            }, 10);
        };

        const handleMouseDown = () => {
            // Hide popover when starting a new selection
            if (selectionPopover.visible) {
                setSelectionPopover({ visible: false, x: 0, y: 0 });
            }
        };

        editorElement.addEventListener('mouseup', handleMouseUp);
        editorElement.addEventListener('mousedown', handleMouseDown);

        return () => {
            editorElement.removeEventListener('mouseup', handleMouseUp);
            editorElement.removeEventListener('mousedown', handleMouseDown);
        };
    }, [editor, commentInputPopover.visible, selectionPopover.visible]);

    return {
        selectionPopover,
        setSelectionPopover,
        commentInputPopover,
        setCommentInputPopover,
        handleDeleteComment,
        handleShowCommentInput,
        handleAddComment,
        handleCancelCommentInput
    };
};
