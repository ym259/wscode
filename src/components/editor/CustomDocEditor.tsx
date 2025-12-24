'use client';

import React, { useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Underline as UnderlineExtension } from '@tiptap/extension-underline';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import FontFamily from '@tiptap/extension-font-family';
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';

import { DocxReader } from '../../lib/docx/DocxReader';
import { DocxWriter } from '../../lib/docx/DocxWriter';
import {
    BlockIdExtension,
    DeleteBlockCommand,
    CustomParagraph,
    FontSize,
    InsertionMark,
    DeletionMark,
    CommentMark,
} from './extensions';
import { EditorToolbar } from './toolbar/EditorToolbar';
import { CommentsSidebar } from './sidebar/CommentsSidebar';
import { TrackChangePopup, TrackChangePopupData } from './popups/TrackChangePopup';

import './CustomDocEditor.css';

// Interface for the exposed editor handle
export interface CustomDocEditorHandle {
    editor: Editor | null;
    getEditor: () => Editor | null;
    setDocumentMode: (mode: 'editing' | 'suggesting') => void;
    export: () => Promise<Blob | null>;
}

interface CustomDocEditorProps {
    file?: File;
}

interface Comment {
    id: string;
    author: string;
    date: string;
    content: string;
}

export type TrackChangesDisplayMode = 'markup' | 'final';

export const CustomDocEditor = forwardRef<CustomDocEditorHandle, CustomDocEditorProps>(({ file }, ref) => {
    const [isLoading, setIsLoading] = useState(false);
    const [comments, setComments] = useState<Comment[]>([]);
    const [trackChangePopup, setTrackChangePopup] = useState<TrackChangePopupData | null>(null);
    const [showRuler, setShowRuler] = useState(true);
    const [docAttrs, setDocAttrs] = useState<any>(null);
    const [trackChangesDisplayMode, setTrackChangesDisplayMode] = useState<TrackChangesDisplayMode>('markup');
    // This key changes on selection update to force toolbar re-render
    const [selectionUpdateKey, setSelectionUpdateKey] = useState(0);

    const editor = useEditor({
        extensions: [
            StarterKit.configure({ paragraph: false }),
            CustomParagraph,
            BlockIdExtension,
            DeleteBlockCommand,
            UnderlineExtension,
            TextStyle,
            FontSize,
            Image.configure({ inline: true, allowBase64: true }),
            InsertionMark,
            DeletionMark,
            CommentMark,
            Table.configure({ resizable: true }),
            TableRow,
            TableHeader,
            TableCell,
            TextAlign.configure({ types: ['heading', 'paragraph'] }),
            Color,
            FontFamily,
            Highlight.configure({ multicolor: true }),
        ],
        content: '',
        immediatelyRender: false,
        editorProps: {
            attributes: {
                class: 'prose prose-sm max-w-none focus:outline-none min-h-[1000px]',
            },
        },
        onSelectionUpdate: () => {
            // Increment key to force toolbar re-render when selection changes
            setSelectionUpdateKey(prev => prev + 1);
        },
    });

    // Expose editor instance and helpers via ref
    useImperativeHandle(ref, () => {
        if (editor) {
            (editor as any).helpers = {
                blockNode: {
                    getBlockNodes: () => {
                        const blocks: any[] = [];
                        editor.state.doc.descendants((node, pos) => {
                            if (node.isBlock) {
                                blocks.push({ node, pos });
                            }
                            return true;
                        });
                        return blocks;
                    }
                }
            };
        }

        return {
            editor,
            getEditor: () => editor,
            setDocumentMode: (mode: 'editing' | 'suggesting') => {
                console.log(`[CustomDocEditor] setDocumentMode called with: ${mode}`);
            },
            export: async () => {
                if (!editor) return null;
                try {
                    const writer = new DocxWriter();
                    const content = editor.getJSON();
                    if (docAttrs) {
                        content.attrs = docAttrs;
                    }
                    const blob = await writer.export(content);
                    console.log('[CustomDocEditor] Export successful, blob size:', blob.size);
                    return blob;
                } catch (error) {
                    console.error('[CustomDocEditor] Export failed:', error);
                    return null;
                }
            }
        };
    }, [editor, docAttrs]);

    // Load DOCX file
    useEffect(() => {
        if (!file || !editor) return;

        const loadFile = async () => {
            setIsLoading(true);
            try {
                const arrayBuffer = await file.arrayBuffer();
                const reader = new DocxReader();
                const content = await reader.load(arrayBuffer);

                if (content.attrs) {
                    setDocAttrs(content.attrs);
                }

                editor.commands.setContent(content);

                // Extract comments
                const extractedComments: Comment[] = [];
                const seenIds = new Set<string>();
                editor.state.doc.descendants((node) => {
                    node.marks.forEach((mark) => {
                        if (mark.type.name === 'comment') {
                            const { commentId, author, date, content: commentContent } = mark.attrs;
                            if (commentId && !seenIds.has(commentId)) {
                                seenIds.add(commentId);
                                extractedComments.push({
                                    id: commentId,
                                    author: author || 'Unknown',
                                    date: date || '',
                                    content: commentContent || '',
                                });
                            }
                        }
                    });
                    return true;
                });
                setComments(extractedComments);
            } catch (error) {
                console.error('Failed to load DOCX:', error);
            } finally {
                setIsLoading(false);
            }
        };

        loadFile();
    }, [file, editor]);

    // Handle clicks on track change elements
    useEffect(() => {
        const handleTrackChangeClick = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            const insElement = target.closest('.track-change-insertion, ins');
            const delElement = target.closest('.track-change-deletion, del');

            if (insElement || delElement) {
                const element = (insElement || delElement) as HTMLElement;
                const isInsertion = !!insElement;
                const author = element.getAttribute('data-author') || 'Unknown';
                const date = element.getAttribute('data-date') || '';
                const content = element.textContent || '';
                const rect = element.getBoundingClientRect();

                setTrackChangePopup({
                    visible: true,
                    x: rect.left,
                    y: rect.bottom + 5,
                    type: isInsertion ? 'insertion' : 'deletion',
                    author,
                    date,
                    content: content.length > 50 ? content.substring(0, 50) + '...' : content,
                    element,
                });
                event.stopPropagation();
            } else {
                setTrackChangePopup(null);
            }
        };

        const handleScroll = () => setTrackChangePopup(null);

        document.addEventListener('click', handleTrackChangeClick);
        window.addEventListener('scroll', handleScroll, true);

        return () => {
            document.removeEventListener('click', handleTrackChangeClick);
            window.removeEventListener('scroll', handleScroll, true);
        };
    }, []);

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
        // and if the next node is marked. posAtDOM often returns the start pos of the clicked element,
        // which matches the end pos of the previous node.
        if (!isMarked(nodes[idx].node)) {
            const nodeEnd = nodes[idx].pos + nodes[idx].node.nodeSize;
            if (pos === nodeEnd && idx + 1 < nodes.length) {
                if (isMarked(nodes[idx + 1].node)) {
                    idx++;
                }
            }
        }

        // Verify the clicked node itself is marked (it should be)
        if (!isMarked(nodes[idx].node)) return null;

        // Expand left
        let startIdx = idx;
        while (startIdx > 0) {
            const prev = nodes[startIdx - 1];
            // Ensure adjacency
            if (prev.pos + prev.node.nodeSize !== nodes[startIdx].pos) break;
            if (!isMarked(prev.node)) break;
            startIdx--;
        }

        // Expand right
        let endIdx = idx;
        while (endIdx < nodes.length - 1) {
            const next = nodes[endIdx + 1];
            // Ensure adjacency
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
            />

            <div style={{
                flexGrow: 1,
                display: 'flex',
                overflow: 'hidden',
                backgroundColor: '#f3f2f1',
            }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    {/* Ruler */}
                    {showRuler && (
                        <div style={{
                            width: '100%',
                            height: '24px',
                            backgroundColor: '#fff',
                            borderBottom: '1px solid #e5e7eb',
                            display: 'flex',
                            alignItems: 'flex-end',
                            padding: '0 24px',
                            fontSize: '10px',
                            color: '#9ca3af',
                            flexShrink: 0,
                        }}>
                            <div style={{
                                flex: 1,
                                height: '100%',
                                display: 'flex',
                                alignItems: 'flex-end',
                                backgroundImage: 'linear-gradient(90deg, transparent 9px, #e5e7eb 9px, #e5e7eb 10px, transparent 10px)',
                                backgroundSize: '10px 100%'
                            }}>
                                {Array.from({ length: 20 }).map((_, i) => (
                                    <div key={i} style={{ width: '50px', borderLeft: '1px solid #9ca3af', height: '12px', paddingLeft: '2px' }}>
                                        {i + 1}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

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
                            <div
                                className={trackChangesDisplayMode === 'final' ? 'track-changes-final-mode' : ''}
                                style={{
                                    backgroundColor: '#ffffff',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)',
                                    color: '#000000',
                                    // Word US Letter: 8.5" x 11" at 96 DPI = 816px x 1056px
                                    // When docAttrs available, use actual page settings
                                    width: (() => {
                                        const pageWidthTwips = docAttrs?.pageSize?.['w:w'] ?? 12240; // Default US Letter
                                        return `${Math.round((pageWidthTwips / 1440) * 96)}px`; // 816px for Letter
                                    })(),
                                    minHeight: (() => {
                                        const pageHeightTwips = docAttrs?.pageSize?.['w:h'] ?? 15840; // Default US Letter
                                        return `${Math.round((pageHeightTwips / 1440) * 96)}px`; // 1056px for Letter
                                    })(),
                                    // Margins from document or default 1" (1440 twips = 96px at 96dpi)
                                    paddingTop: (() => {
                                        const topTwips = docAttrs?.pageMargins?.['w:top'] ?? 1440;
                                        return `${Math.round((topTwips / 1440) * 96)}px`;
                                    })(),
                                    paddingRight: (() => {
                                        const rightTwips = docAttrs?.pageMargins?.['w:right'] ?? 1440;
                                        return `${Math.round((rightTwips / 1440) * 96)}px`;
                                    })(),
                                    paddingBottom: (() => {
                                        const bottomTwips = docAttrs?.pageMargins?.['w:bottom'] ?? 1440;
                                        return `${Math.round((bottomTwips / 1440) * 96)}px`;
                                    })(),
                                    paddingLeft: (() => {
                                        const leftTwips = docAttrs?.pageMargins?.['w:left'] ?? 1440;
                                        return `${Math.round((leftTwips / 1440) * 96)}px`;
                                    })(),
                                    margin: '24px auto',
                                    boxSizing: 'border-box',
                                }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <EditorContent editor={editor} />
                            </div>
                        )}
                    </div>
                </div>

                <CommentsSidebar comments={comments} />
            </div>

            <TrackChangePopup
                data={trackChangePopup}
                onAccept={handleAcceptChange}
                onReject={handleRejectChange}
                onClose={() => setTrackChangePopup(null)}
            />
        </div>
    );
});

CustomDocEditor.displayName = 'CustomDocEditor';
