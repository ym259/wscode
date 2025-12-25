/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/immutability */
import { useImperativeHandle, Dispatch, SetStateAction } from 'react';
import { useEditor, Editor } from '@tiptap/react';
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

import { DocxWriter } from '../../../lib/docx/DocxWriter';
import {
    BlockIdExtension,
    DeleteBlockCommand,
    CustomParagraph,
    FontSize,
    InsertionMark,
    DeletionMark,
    CommentMark,
} from '../extensions';
import { Comment } from './types';

interface UseCustomEditorProps {
    setSelectionUpdateKey: Dispatch<SetStateAction<number>>;
}

export const useCustomEditor = ({ setSelectionUpdateKey }: UseCustomEditorProps) => {
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

    return editor;
};

export const useEditorHandle = (
    ref: any,
    editor: Editor | null,
    docAttrs: any,
    comments: Comment[],
    setComments: Dispatch<SetStateAction<Comment[]>>,
    setDocAttrs: Dispatch<SetStateAction<any>>
) => {
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
                },
                comments: {
                    // Add a comment to the state (for sidebar sync)
                    addComment: (comment: { id: string; author: string; date: string; content: string }) => {
                        setComments(prev => [...prev, comment]);
                    },
                    // Get all comments
                    getComments: () => comments,
                    // Remove a comment from state
                    removeComment: (commentId: string) => {
                        setComments(prev => prev.filter(c => c.id !== commentId));
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
            },
            scrollToBlock: (blockIndex: number) => {
                if (!editor) return;
                const blocks: any[] = [];
                editor.state.doc.descendants((node, pos) => {
                    if (node.isBlock) {
                        blocks.push({ node, pos });
                    }
                    return true;
                });

                const block = blocks[blockIndex];
                if (block) {
                    // Focus and scroll to the block
                    editor.chain()
                        .setTextSelection(block.pos)
                        .scrollIntoView()
                        .focus()
                        .run();
                }
            },
            getDocAttrs: () => docAttrs,
            setPageLayout: (updates: {
                pageSize?: { width?: number; height?: number };
                pageMargins?: { top?: number; right?: number; bottom?: number; left?: number };
            }) => {
                setDocAttrs((prev: any) => {
                    const newAttrs = { ...prev };

                    // Update page size (values in twips: 1 inch = 1440 twips, 1 mm = ~56.7 twips)
                    if (updates.pageSize) {
                        newAttrs.pageSize = {
                            ...prev?.pageSize,
                            'w:w': updates.pageSize.width ?? prev?.pageSize?.['w:w'] ?? 12240,
                            'w:h': updates.pageSize.height ?? prev?.pageSize?.['w:h'] ?? 15840,
                        };
                    }

                    // Update page margins (values in twips)
                    if (updates.pageMargins) {
                        newAttrs.pageMargins = {
                            ...prev?.pageMargins,
                            'w:top': updates.pageMargins.top ?? prev?.pageMargins?.['w:top'] ?? 1440,
                            'w:right': updates.pageMargins.right ?? prev?.pageMargins?.['w:right'] ?? 1440,
                            'w:bottom': updates.pageMargins.bottom ?? prev?.pageMargins?.['w:bottom'] ?? 1440,
                            'w:left': updates.pageMargins.left ?? prev?.pageMargins?.['w:left'] ?? 1440,
                        };
                    }

                    console.log('[CustomDocEditor] Page layout updated:', newAttrs);
                    return newAttrs;
                });
            }
        };
    }, [editor, docAttrs, comments, setComments, setDocAttrs]);
};
