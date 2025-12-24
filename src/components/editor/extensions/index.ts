/**
 * Custom Tiptap Extensions for CustomDocEditor
 * 
 * This module exports all the custom extensions needed for DOCX editing:
 * - BlockIdExtension: Unique IDs for block nodes
 * - DeleteBlockCommand: Delete blocks by ID
 * - CustomParagraph: DOCX indent/lineHeight support
 * - FontSize: Font size commands
 * - InsertionMark: Track changes insertions
 * - DeletionMark: Track changes deletions
 * - CommentMark: DOCX comments highlighting
 */

import { Extension, Mark } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import Paragraph from '@tiptap/extension-paragraph';

// Generate unique ID for blocks
export const generateId = () => Math.random().toString(36).substr(2, 9);

// Block ID Extension - Adds unique IDs to all block nodes
export const BlockIdExtension = Extension.create({
    name: 'blockId',

    addGlobalAttributes() {
        return [
            {
                types: ['paragraph', 'heading', 'bulletList', 'orderedList', 'listItem', 'table', 'image'],
                attributes: {
                    sdBlockId: {
                        default: null,
                        parseHTML: element => element.getAttribute('data-sd-block-id'),
                        renderHTML: attributes => {
                            if (!attributes.sdBlockId) {
                                return {};
                            }
                            return {
                                'data-sd-block-id': attributes.sdBlockId,
                            };
                        },
                        keepOnSplit: false,
                    },
                },
            },
        ];
    },

    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: new PluginKey('blockId'),
                appendTransaction: (transactions, oldState, newState) => {
                    if (!transactions.some(tr => tr.docChanged)) return;

                    const tr = newState.tr;
                    let modified = false;

                    newState.doc.descendants((node, pos) => {
                        const isBlockType = ['paragraph', 'heading', 'bulletList', 'orderedList', 'listItem', 'table', 'image'].includes(node.type.name);

                        if (isBlockType && !node.attrs.sdBlockId) {
                            tr.setNodeMarkup(pos, undefined, {
                                ...node.attrs,
                                sdBlockId: generateId(),
                            });
                            modified = true;
                        }
                    });

                    if (modified) return tr;
                },
            }),
        ];
    },
});

// Command to delete block by ID
export const DeleteBlockCommand = Extension.create({
    name: 'deleteBlockCommand',

    addCommands() {
        return {
            deleteBlockNodeById: (id: string) => ({ tr, dispatch, state }) => {
                if (dispatch) {
                    let posToDelete: number | null = null;
                    let sizeToDelete = 0;

                    state.doc.descendants((node, pos) => {
                        if (posToDelete !== null) return false;
                        if (node.attrs.sdBlockId === id) {
                            posToDelete = pos;
                            sizeToDelete = node.nodeSize;
                            return false;
                        }
                        return true;
                    });

                    if (posToDelete !== null) {
                        tr.delete(posToDelete, posToDelete + sizeToDelete);
                        return true;
                    }
                    return false;
                }
                return true;
            }
        }
    }
});

// Custom Paragraph extension to support DOCX indent attribute
export const CustomParagraph = Paragraph.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            indent: {
                default: null,
                parseHTML: element => element.getAttribute('data-indent'),
                renderHTML: attributes => {
                    if (!attributes.indent) {
                        return {};
                    }
                    return {
                        'data-indent': attributes.indent,
                    };
                },
            },
            lineHeight: {
                default: null,
                parseHTML: element => element.getAttribute('data-line-height'),
                renderHTML: attributes => {
                    if (!attributes.lineHeight) {
                        return {};
                    }
                    // DOCX line height: w:line value is in 240ths of a line
                    // w:lineRule="auto" means: value / 240 = line height multiplier
                    // e.g., 275 / 240 = 1.146 (representing "Multiple 1.15" in Word)
                    //
                    // IMPORTANT: Word's "Multiple" spacing multiplies the font's NATURAL line height,
                    // not the font-size. For Japanese fonts, natural line-height is typically ~1.5x font-size.
                    // CSS line-height multiplies font-size directly.
                    //
                    // To match Word: cssLineHeight = (docxMultiplier) * (naturalLineHeight / fontSize)
                    // For most fonts, naturalLineHeight ≈ 1.2 to 1.5 times fontSize.
                    // For Hiragino Mincho ProN at 16px, natural is 24px (1.5 ratio).
                    //
                    // So: cssLineHeight = (275/240) * 1.3 ≈ 1.49 (using a middle ground factor)
                    const lineValue = parseInt(attributes.lineHeight);
                    const docxMultiplier = lineValue / 240;
                    // Word's "Multiple" line spacing multiplies the font's natural height (~1.3x),
                    // not just the font-size. Apply this factor to match Word's rendering.
                    const baseLineFactor = 1.3;
                    const cssLineHeight = docxMultiplier * baseLineFactor;
                    return {
                        'data-line-height': attributes.lineHeight,
                        style: `line-height: ${cssLineHeight.toFixed(3)};`,
                    };
                },
            },
            spacingBefore: {
                default: null,
                parseHTML: element => element.getAttribute('data-spacing-before'),
                renderHTML: attributes => {
                    if (!attributes.spacingBefore) return {};
                    // Convert twips to pt (twips / 20)
                    const ptValue = parseInt(attributes.spacingBefore) / 20;
                    return {
                        'data-spacing-before': attributes.spacingBefore,
                        style: `margin-top: ${ptValue}pt;`,
                    };
                }
            },
            spacingAfter: {
                default: null,
                parseHTML: element => element.getAttribute('data-spacing-after'),
                renderHTML: attributes => {
                    if (!attributes.spacingAfter) return {};
                    // Convert twips to pt (twips / 20)
                    const ptValue = parseInt(attributes.spacingAfter) / 20;
                    return {
                        'data-spacing-after': attributes.spacingAfter,
                        style: `margin-bottom: ${ptValue}pt;`,
                    };
                }
            },
            contextualSpacing: {
                default: null,
                parseHTML: element => element.getAttribute('data-contextual-spacing'),
                renderHTML: attributes => {
                    if (!attributes.contextualSpacing) return {};
                    return { 'data-contextual-spacing': attributes.contextualSpacing };
                }
            },
            lineRule: {
                default: null,
                parseHTML: element => element.getAttribute('data-line-rule'),
                renderHTML: attributes => {
                    if (!attributes.lineRule) return {};
                    return { 'data-line-rule': attributes.lineRule };
                }
            },
            snapToGrid: {
                default: null,
                parseHTML: element => element.getAttribute('data-snap-to-grid'),
                renderHTML: attributes => {
                    if (!attributes.snapToGrid) return {};
                    return { 'data-snap-to-grid': attributes.snapToGrid };
                }
            },
        };
    },
});

// Custom Extension for Font Size
export const FontSize = Extension.create({
    name: 'fontSize',
    addOptions() {
        return {
            types: ['textStyle'],
        };
    },
    addGlobalAttributes() {
        return [
            {
                types: this.options.types,
                attributes: {
                    fontSize: {
                        default: null,
                        parseHTML: element => element.style.fontSize?.replace(/['"]+/g, '') || null,
                        renderHTML: attributes => {
                            if (!attributes.fontSize) {
                                return {};
                            }
                            return {
                                style: `font-size: ${attributes.fontSize}`,
                            };
                        },
                    },
                },
            },
        ];
    },
    addCommands() {
        return {
            setFontSize: (fontSize: string) => ({ chain }) => {
                return chain()
                    .setMark('textStyle', { fontSize })
                    .run();
            },
            unsetFontSize: () => ({ chain }) => {
                return chain()
                    .setMark('textStyle', { fontSize: null })
                    .removeEmptyTextStyle()
                    .run();
            },
        };
    },
});

// Custom Mark for Track Changes - Insertion
export const InsertionMark = Mark.create({
    name: 'insertion',

    addAttributes() {
        return {
            author: { default: 'Unknown' },
            date: { default: '' },
            comment: { default: '' },
        };
    },

    parseHTML() {
        return [{ tag: 'ins' }];
    },

    renderHTML({ HTMLAttributes }) {
        return ['ins', {
            class: 'track-change-insertion',
            'data-author': HTMLAttributes.author,
            'data-date': HTMLAttributes.date,
            'data-comment': HTMLAttributes.comment,
        }, 0];
    },
});

// Custom Mark for Track Changes - Deletion
export const DeletionMark = Mark.create({
    name: 'deletion',

    addAttributes() {
        return {
            author: { default: 'Unknown' },
            date: { default: '' },
            comment: { default: '' },
        };
    },

    parseHTML() {
        return [{ tag: 'del' }];
    },

    renderHTML({ HTMLAttributes }) {
        return ['del', {
            class: 'track-change-deletion',
            'data-author': HTMLAttributes.author,
            'data-date': HTMLAttributes.date,
            'data-comment': HTMLAttributes.comment,
        }, 0];
    },
});

// Custom Mark for Comments - highlights commented text
export const CommentMark = Mark.create({
    name: 'comment',

    addAttributes() {
        return {
            commentId: { default: null },
            author: { default: 'Unknown' },
            date: { default: '' },
            content: { default: '' },
        };
    },

    parseHTML() {
        return [{ tag: 'span[data-comment-id]' }];
    },

    renderHTML({ HTMLAttributes }) {
        return ['span', {
            class: 'comment-highlight',
            'data-comment-id': HTMLAttributes.commentId,
            'data-comment-author': HTMLAttributes.author,
            'data-comment-date': HTMLAttributes.date,
            'data-comment-content': HTMLAttributes.content,
        }, 0];
    },

    addCommands() {
        return {
            setComment: (comment: string) => ({ commands }: { commands: any }) => {
                return commands.setMark('comment', {
                    commentId: generateId(),
                    author: 'AI Assistant',
                    date: new Date().toISOString(),
                    content: comment,
                });
            },
            unsetComment: () => ({ commands }: { commands: any }) => {
                return commands.unsetMark('comment');
            },
        }
    }
});

// TypeScript module augmentation for custom commands
declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        deleteBlockCommand: {
            deleteBlockNodeById: (id: string) => ReturnType;
        };
        fontSize: {
            setFontSize: (fontSize: string) => ReturnType;
            unsetFontSize: () => ReturnType;
        };
        comment: {
            setComment: (comment: string) => ReturnType;
            unsetComment: () => ReturnType;
        };
    }
}
