import { useEffect } from 'react';
import { Editor } from '@tiptap/react';
import { useWorkspace } from '@/contexts/WorkspaceContext';

interface UseOutlineProps {
    editor: Editor | null;
}

export const useOutline = ({ editor }: UseOutlineProps) => {
    const { setActiveOutline, navRequest, setNavRequest } = useWorkspace();

    // 1. Scan for headings on content update
    useEffect(() => {
        if (!editor) return;

        const updateOutline = () => {
            const headings: { id: string; text: string; level: number }[] = [];
            editor.state.doc.descendants((node, pos) => {
                if (node.type.name === 'heading') {
                    const id = node.attrs.sdBlockId;
                    const text = node.textContent;
                    const level = node.attrs.level;
                    if (id && text) {
                        headings.push({ id, text, level });
                    }
                }
                return false; // Don't traverse into heading children (text nodes)
            });

            // Prevent infinite loops / unnecessary updates by deep comparing if needed,
            // but setting state usually handles shallow comp or basic updates.
            // For now simple set.
            setActiveOutline(headings);
        };

        // Initial scan
        updateOutline();

        // Subscribe to updates
        editor.on('update', updateOutline);

        return () => {
            editor.off('update', updateOutline);
        };
    }, [editor, setActiveOutline]);

    // 2. Handle Navigation Requests
    useEffect(() => {
        if (!editor || !navRequest) return;

        let targetPos: number | null = null;
        editor.state.doc.descendants((node, pos) => {
            if (node.attrs.sdBlockId === navRequest) {
                targetPos = pos;
                return false;
            }
            return true;
        });

        if (targetPos !== null) {
            // Find the heading element by its data attribute for reliable scrolling
            const editorElement = editor.view.dom;
            const headingElement = editorElement.querySelector(`[data-sd-block-id="${navRequest}"]`);

            // Set cursor position (this may trigger its own scroll)
            editor.chain()
                .focus()
                .setTextSelection(targetPos)
                .run();

            // Use requestAnimationFrame to scroll after the focus scroll completes
            if (headingElement) {
                requestAnimationFrame(() => {
                    headingElement.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center'
                    });
                });
            }

            // Clear request immediately
            setNavRequest(null);
        }
    }, [editor, navRequest, setNavRequest]);
};
