/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import { Editor } from '@tiptap/react';
import { TrackChangePopupData } from '../popups/TrackChangePopup';

interface UseTrackChangesProps {
    editor: Editor | null;
}

export const useTrackChanges = ({ editor }: UseTrackChangesProps) => {
    const [trackChangePopup, setTrackChangePopup] = useState<TrackChangePopupData | null>(null);

    // Helper to find the full extent of a tracked change group (contiguous insertions/deletions)
    const getChangeGroupRange = (view: any, pos: number): { from: number, to: number } | null => {
        const doc = view.state.doc;
        const $pos = doc.resolve(pos);
        const blockRange = $pos.blockRange();
        if (!blockRange) return null;

        const nodes: { pos: number, node: any }[] = [];
        doc.nodesBetween(blockRange.start, blockRange.end, (node: any, nodePos: number) => {
            if (node.isText) {
                nodes.push({ pos: nodePos, node });
            }
        });

        // Find clicked text node
        let idx = nodes.findIndex(n => n.pos <= pos && (n.pos + n.node.nodeSize) >= pos);
        if (idx === -1) return null;

        // Check availability of marks
        const isMarked = (node: any) => node.marks.some((m: any) => m.type.name === 'insertion' || m.type.name === 'deletion');

        // If the found node is not marked, check if we are at the boundary between nodes
        // and if the next node is marked
        if (!isMarked(nodes[idx].node)) {
            const nodeEnd = nodes[idx].pos + nodes[idx].node.nodeSize;
            if (pos === nodeEnd && idx + 1 < nodes.length) {
                if (isMarked(nodes[idx + 1].node)) {
                    idx++;
                }
            }
        }

        // Verify the clicked node itself is marked
        if (!isMarked(nodes[idx].node)) return null;

        // Expand left
        let startIdx = idx;
        while (startIdx > 0) {
            const prev = nodes[startIdx - 1];
            if (prev.pos + prev.node.nodeSize !== nodes[startIdx].pos) break;
            if (!isMarked(prev.node)) break;
            startIdx--;
        }

        // Expand right
        let endIdx = idx;
        while (endIdx < nodes.length - 1) {
            const next = nodes[endIdx + 1];
            if (nodes[endIdx].pos + nodes[endIdx].node.nodeSize !== next.pos) break;
            if (!isMarked(next.node)) break;
            endIdx++;
        }

        return {
            from: nodes[startIdx].pos,
            to: nodes[endIdx].pos + nodes[endIdx].node.nodeSize
        };
    };

    // Accept track change (Grouped)
    const handleAcceptChange = () => {
        if (!editor || !trackChangePopup?.element) return;
        const view = editor.view;

        let pos: number;
        try {
            pos = view.posAtDOM(trackChangePopup.element, 0);
        } catch {
            return;
        }

        const state = editor.state;
        const range = getChangeGroupRange(view, pos);
        if (!range) return;

        const { from, to } = range;
        const tr = state.tr;

        // 1. Remove insertion marks (accept insertion)
        const insertionMark = state.schema.marks.insertion;
        if (insertionMark) {
            tr.removeMark(from, to, insertionMark);
        }

        // 2. Delete deletion ranges (accept deletion -> remove text)
        const rangesToDelete: { from: number, to: number }[] = [];
        state.doc.nodesBetween(from, to, (node: any, nodePos: number) => {
            if (node.isText && node.marks.some((m: any) => m.type.name === 'deletion')) {
                rangesToDelete.push({ from: nodePos, to: nodePos + node.nodeSize });
            }
        });

        // Delete in reverse order
        for (let i = rangesToDelete.length - 1; i >= 0; i--) {
            tr.delete(rangesToDelete[i].from, rangesToDelete[i].to);
        }

        editor.view.dispatch(tr);
        setTrackChangePopup(null);
    };

    // Reject track change (Grouped)
    const handleRejectChange = () => {
        if (!editor || !trackChangePopup?.element) return;
        const view = editor.view;

        let pos: number;
        try {
            pos = view.posAtDOM(trackChangePopup.element, 0);
        } catch { return; }

        const state = editor.state;
        const range = getChangeGroupRange(view, pos);
        if (!range) return;

        const { from, to } = range;
        const tr = state.tr;

        // 1. Remove deletion marks (reject deletion -> restore text)
        const deletionMark = state.schema.marks.deletion;
        if (deletionMark) {
            tr.removeMark(from, to, deletionMark);
        }

        // 2. Delete insertion ranges (reject insertion -> remove text)
        const rangesToDelete: { from: number, to: number }[] = [];
        state.doc.nodesBetween(from, to, (node: any, nodePos: number) => {
            if (node.isText && node.marks.some((m: any) => m.type.name === 'insertion')) {
                rangesToDelete.push({ from: nodePos, to: nodePos + node.nodeSize });
            }
        });

        for (let i = rangesToDelete.length - 1; i >= 0; i--) {
            tr.delete(rangesToDelete[i].from, rangesToDelete[i].to);
        }

        editor.view.dispatch(tr);
        setTrackChangePopup(null);
    };

    useEffect(() => {
        const handleDocumentClick = (event: MouseEvent) => {
            const target = event.target as HTMLElement;

            // Handle track change clicks
            const insElement = target.closest('.track-change-insertion, ins');
            const delElement = target.closest('.track-change-deletion, del');

            if (insElement || delElement) {
                const element = (insElement || delElement) as HTMLElement;
                const isInsertion = !!insElement;
                const author = element.getAttribute('data-author') || 'Unknown';
                const date = element.getAttribute('data-date') || '';
                const comment = element.getAttribute('data-comment') || '';
                const content = element.textContent || '';
                const rect = element.getBoundingClientRect();

                setTrackChangePopup({
                    visible: true,
                    x: rect.left,
                    y: rect.bottom + 5,
                    type: isInsertion ? 'insertion' : 'deletion',
                    author,
                    date,
                    comment,
                    content: content.length > 50 ? content.substring(0, 50) + '...' : content,
                    element,
                });
                event.stopPropagation();
            } else {
                setTrackChangePopup(null);
            }
        };

        const handleScroll = () => {
            setTrackChangePopup(null);
        };

        document.addEventListener('click', handleDocumentClick);
        window.addEventListener('scroll', handleScroll, true);

        return () => {
            document.removeEventListener('click', handleDocumentClick);
            window.removeEventListener('scroll', handleScroll, true);
        };
    }, []);

    return {
        trackChangePopup,
        setTrackChangePopup,
        handleAcceptChange,
        handleRejectChange
    };
};
