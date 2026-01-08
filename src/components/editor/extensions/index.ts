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
 * - CustomParagraph: Extended paragraph with DOCX attributes
 * - CustomHeading: Extended heading with styleId for DOCX roundtrip
 */

import { Extension, Mark } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
/* eslint-disable @typescript-eslint/no-explicit-any */
import Paragraph from '@tiptap/extension-paragraph';
import Heading from '@tiptap/extension-heading';
import OrderedList from '@tiptap/extension-ordered-list';

/**
 * Map DOCX numFmt values to CSS list-style-type values
 * This enables proper rendering of Japanese/CJK list formats
 */
const numFmtToCssListStyle: Record<string, string> = {
    'decimal': 'decimal',
    'ideographTraditional': 'none', // Handle via CSS counter in CustomDocEditor.css to support (甲) format
    'aiueoFullWidth': 'hiragana', // アイウエオ in full-width
    'iroha': 'hiragana-iroha',
    'decimalFullWidth': 'decimal',
    'decimalEnclosedCircle': 'decimal', // ①②③ - CSS doesn't have direct support
    'japaneseCounting': 'cjk-ideographic',
    'japaneseDigitalTenThousand': 'cjk-ideographic',
    'chineseCounting': 'cjk-ideographic',
    'chineseCountingThousand': 'cjk-ideographic',
    'koreanCounting': 'korean-hangul-formal',
    'koreanDigital': 'korean-hangul-formal',
    'lowerLetter': 'lower-alpha',
    'upperLetter': 'upper-alpha',
    'lowerRoman': 'lower-roman',
    'upperRoman': 'upper-roman',
    'bullet': 'disc',
    'none': 'none',
};

// Custom OrderedList extension to support DOCX numFmt for Japanese list styles
export const CustomOrderedList = OrderedList.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            // Original DOCX number ID for roundtrip preservation
            originalNumId: {
                default: null,
                parseHTML: element => element.getAttribute('data-original-num-id'),
                renderHTML: attributes => {
                    if (!attributes.originalNumId) return {};
                    return { 'data-original-num-id': attributes.originalNumId };
                }
            },
            // List level for nested lists
            level: {
                default: 0,
                parseHTML: element => parseInt(element.getAttribute('data-level') || '0'),
                renderHTML: attributes => {
                    return { 'data-level': attributes.level };
                }
            },
            // Number format from DOCX numbering.xml (e.g., ideographTraditional, decimal)
            numFmt: {
                default: null,
                parseHTML: element => element.getAttribute('data-num-fmt'),
                renderHTML: attributes => {
                    if (!attributes.numFmt) return {};

                    const cssListStyle = numFmtToCssListStyle[attributes.numFmt] || 'decimal';
                    return {
                        'data-num-fmt': attributes.numFmt,
                        style: `list-style-type: ${cssListStyle};`,
                    };
                }
            },
            // Level text pattern from DOCX (e.g., "（%1）", "%1.")
            lvlText: {
                default: null,
                parseHTML: element => element.getAttribute('data-lvl-text'),
                renderHTML: attributes => {
                    if (!attributes.lvlText) return {};
                    return { 'data-lvl-text': attributes.lvlText };
                }
            },
            // Indentation from numbering definition
            numIndent: {
                default: null,
                parseHTML: element => {
                    const left = element.getAttribute('data-num-indent-left');
                    const hanging = element.getAttribute('data-num-indent-hanging');
                    if (!left && !hanging) return null;
                    return { left, hanging };
                },
                renderHTML: attributes => {
                    if (!attributes.numIndent) return {};
                    const result: Record<string, string> = {};
                    let style = '';

                    if (attributes.numIndent.left) {
                        result['data-num-indent-left'] = attributes.numIndent.left;
                        // Convert twips to pt (1 twip = 1/20 pt)
                        const leftPt = parseInt(attributes.numIndent.left) / 20;
                        style += `padding-left: ${leftPt}pt; `;
                    }
                    if (attributes.numIndent.hanging) {
                        result['data-num-indent-hanging'] = attributes.numIndent.hanging;
                        // Hanging indent usually means the first line is indented less than the rest
                        // Apply negative text-indent to achieve this (affects the marker position relative to text)
                        const hangingPt = parseInt(attributes.numIndent.hanging) / 20;
                        style += `text-indent: -${hangingPt}pt; `;
                    }

                    if (style) {
                        result.style = style;
                    }
                    return result;
                }
            },
            // Start attribute to handle split lists and custom counter resets
            start: {
                default: 1,
                parseHTML: element => element.hasAttribute('start') ? parseInt(element.getAttribute('start') || '', 10) : 1,
                renderHTML: attributes => {
                    const start = attributes.start;
                    const res: any = { start };

                    // For Japanese Article numbering, we use a custom CSS counter 'article-counter'.
                    // We must manually set the counter-reset to (start - 1) so the first item (which increments) is correct.
                    // This is necessary because split lists (interrupted by text) are separate <ol> elements in HTML.
                    if (attributes.lvlText === '第%1条' || attributes.lvlText === '第%1') {
                        // Inherit existing style if any (merged from other attributes like numIndent?)
                        // Note: Tiptap merges styles from different attributes if they return 'style' property.
                        const counterStart = start - 1;
                        res.style = `counter-reset: article-counter ${counterStart};`;
                    }

                    return res;
                }
            },
        };
    },
});

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
                    if (!attributes.indent) return {};
                    // Convert twips to pt
                    const indentPt = parseInt(attributes.indent) / 20;
                    return {
                        'data-indent': attributes.indent,
                        style: `margin-left: ${indentPt}pt;`,
                    };
                },
            },
            hanging: {
                default: null,
                parseHTML: element => element.getAttribute('data-hanging'),
                renderHTML: attributes => {
                    if (!attributes.hanging) return {};
                    const hangingPt = parseInt(attributes.hanging) / 20;
                    return {
                        'data-hanging': attributes.hanging,
                        style: `text-indent: -${hangingPt}pt;`,
                    };
                },
            },
            firstLine: {
                default: null,
                parseHTML: element => element.getAttribute('data-first-line'),
                renderHTML: attributes => {
                    if (!attributes.firstLine) return {};
                    const firstLinePt = parseInt(attributes.firstLine) / 20;
                    return {
                        'data-first-line': attributes.firstLine,
                        style: `text-indent: ${firstLinePt}pt;`,
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

                    const lineValue = parseInt(attributes.lineHeight);
                    const lineRule = attributes.lineRule || 'auto';

                    let cssValue: string;

                    if (lineRule === 'exact') {
                        // Fixed line height in points
                        // For "exact" spacing, lineValue is in twips (1/20 pt)
                        // This creates a fixed vertical space regardless of font size
                        const ptValue = lineValue / 20;
                        cssValue = `${ptValue}pt`;
                    } else if (lineRule === 'atLeast') {
                        // Minimum line height
                        // CSS doesn't have min-line-height, so we use regular line-height
                        // This enforces minimum but may not expand beyond it like Word does
                        const ptValue = lineValue / 20;
                        cssValue = `${ptValue}pt`;
                    } else {
                        // lineRule === 'auto' (or default)
                        // Multiplier mode: lineValue is in 240ths of a line
                        // e.g., 276 / 240 = 1.15 (representing "Multiple 1.15" in Word)
                        //
                        // IMPORTANT: Word's "Multiple" spacing multiplies the font's NATURAL line height,
                        // not the font-size. For Japanese fonts, natural line-height is typically ~1.5x font-size.
                        // CSS line-height multiplies font-size directly.
                        //
                        // To match Word: cssLineHeight = (docxMultiplier) * (naturalLineHeight / fontSize)
                        // For most fonts, naturalLineHeight ≈ 1.2 to 1.5 times fontSize.
                        //
                        // Using 1.3 as a middle ground factor to approximate Word's behavior
                        const docxMultiplier = lineValue / 240;
                        const baseLineFactor = 1.3;
                        cssValue = (docxMultiplier * baseLineFactor).toFixed(3);
                    }

                    return {
                        'data-line-height': attributes.lineHeight,
                        'data-line-rule': lineRule,
                        style: `line-height: ${cssValue};`,
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
            // Style ID for heading-style paragraphs (preserves original style for roundtrip)
            styleId: {
                default: null,
                parseHTML: element => element.getAttribute('data-style-id'),
                renderHTML: attributes => {
                    if (!attributes.styleId) return {};
                    return { 'data-style-id': attributes.styleId };
                }
            },
            // Keep Next / Keep Lines (overrides style outline behavior)
            keepNext: {
                default: null,
                parseHTML: element => element.getAttribute('data-keep-next'),
                renderHTML: attributes => {
                    if (attributes.keepNext === null) return {};
                    return { 'data-keep-next': attributes.keepNext };
                }
            },
            keepLines: {
                default: null,
                parseHTML: element => element.getAttribute('data-keep-lines'),
                renderHTML: attributes => {
                    if (attributes.keepLines === null) return {};
                    return { 'data-keep-lines': attributes.keepLines };
                }
            },
            // Paragraph default font properties for DOCX w:pPr/w:rPr
            pPrFontSize: {
                default: null,
                parseHTML: element => element.getAttribute('data-ppr-font-size'),
                renderHTML: attributes => {
                    if (!attributes.pPrFontSize) return {};
                    return { 'data-ppr-font-size': attributes.pPrFontSize };
                }
            },
            pPrFontFamily: {
                default: null,
                parseHTML: element => element.getAttribute('data-ppr-font-family'),
                renderHTML: attributes => {
                    if (!attributes.pPrFontFamily) return {};
                    return { 'data-ppr-font-family': attributes.pPrFontFamily };
                }
            },
            // ========== LIST NUMBERING ATTRIBUTES (paragraph-based rendering) ==========
            listNumId: {
                default: null,
                parseHTML: element => element.getAttribute('data-list-num-id'),
                renderHTML: attributes => {
                    if (!attributes.listNumId) return {};
                    return { 'data-list-num-id': attributes.listNumId };
                }
            },
            listIlvl: {
                default: null,
                parseHTML: element => {
                    const val = element.getAttribute('data-list-ilvl');
                    return val !== null ? parseInt(val) : null;
                },
                renderHTML: attributes => {
                    if (attributes.listIlvl === null || attributes.listIlvl === undefined) return {};
                    return { 'data-list-ilvl': String(attributes.listIlvl) };
                }
            },
            listIsOrdered: {
                default: null,
                parseHTML: element => element.getAttribute('data-list-is-ordered') === 'true',
                renderHTML: attributes => {
                    if (attributes.listIsOrdered === null) return {};
                    return { 'data-list-is-ordered': String(attributes.listIsOrdered) };
                }
            },
            listNumFmt: {
                default: null,
                parseHTML: element => element.getAttribute('data-list-num-fmt'),
                renderHTML: attributes => {
                    if (!attributes.listNumFmt) return {};
                    return { 'data-list-num-fmt': attributes.listNumFmt };
                }
            },
            listLvlText: {
                default: null,
                parseHTML: element => element.getAttribute('data-list-lvl-text'),
                renderHTML: attributes => {
                    if (!attributes.listLvlText) return {};
                    return { 'data-list-lvl-text': attributes.listLvlText };
                }
            },
            listCounterValue: {
                default: null,
                parseHTML: element => {
                    const val = element.getAttribute('data-list-counter-value');
                    return val !== null ? parseInt(val) : null;
                },
                renderHTML: attributes => {
                    if (!attributes.listCounterValue) return {};
                    return { 'data-list-counter-value': String(attributes.listCounterValue) };
                }
            },
            listIndentLeft: {
                default: null,
                parseHTML: element => element.getAttribute('data-list-indent-left'),
                renderHTML: attributes => {
                    if (!attributes.listIndentLeft) return {};
                    // DOCX indent model: left = total indent, hanging = first-line pullback
                    // margin-left = left - hanging (where the paragraph box starts)
                    // padding-left = hanging (gutter for the marker)
                    const leftTwips = parseInt(attributes.listIndentLeft);
                    const hangingTwips = attributes.listIndentHanging ? parseInt(attributes.listIndentHanging) : 0;
                    const marginLeftPt = (leftTwips - hangingTwips) / 20;
                    return {
                        'data-list-indent-left': attributes.listIndentLeft,
                        style: marginLeftPt > 0 ? `margin-left: ${marginLeftPt}pt;` : '',
                    };
                }
            },
            listIndentHanging: {
                default: null,
                parseHTML: element => element.getAttribute('data-list-indent-hanging'),
                renderHTML: attributes => {
                    if (!attributes.listIndentHanging) return {};
                    // Hanging indent creates gutter space for the CSS ::before marker
                    const hangingPt = parseInt(attributes.listIndentHanging) / 20;
                    return {
                        'data-list-indent-hanging': attributes.listIndentHanging,
                        // Set both padding-left and --list-gutter CSS variable
                        // CSS uses --list-gutter for marker width
                        style: `padding-left: ${hangingPt}pt; --list-gutter: ${hangingPt}pt;`,
                    };
                }
            },
            // Pre-rendered marker text (for formats like ideographTraditional that CSS can't generate)
            listMarkerText: {
                default: null,
                parseHTML: element => element.getAttribute('data-list-marker-text'),
                renderHTML: attributes => {
                    if (!attributes.listMarkerText) return {};
                    return { 'data-list-marker-text': attributes.listMarkerText };
                }
            },
        };
    },
});

// Custom Heading extension to support DOCX styleId for roundtrip fidelity
export const CustomHeading = Heading.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            // Original DOCX style ID for roundtrip preservation (e.g., "4" instead of "Heading4")
            styleId: {
                default: null,
                parseHTML: element => element.getAttribute('data-style-id'),
                renderHTML: attributes => {
                    if (!attributes.styleId) return {};
                    return { 'data-style-id': attributes.styleId };
                }
            },
            // Spacing attributes
            // Spacing attributes - Render as inline styles
            spacingBefore: {
                default: null,
                parseHTML: element => element.getAttribute('data-spacing-before'),
                renderHTML: attributes => {
                    if (!attributes.spacingBefore) return {};
                    // Convert twips to pt (twips / 20)
                    const ptValue = parseInt(attributes.spacingBefore) / 20;
                    return {
                        'data-spacing-before': attributes.spacingBefore,
                        style: `margin-top: ${ptValue}pt;`
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
                        style: `margin-bottom: ${ptValue}pt;`
                    };
                }
            },
            // Line Height / Line Rule
            lineHeight: {
                default: 'auto',
                parseHTML: element => element.getAttribute('data-line-height'),
                renderHTML: attributes => {
                    // Removed early return to enforce default styles and tooltip
                    // if (!attributes.lineHeight) return {};

                    const lineValue = parseInt(attributes.lineHeight) || 240; // Default to 240 (100%)
                    const lineRule = attributes.lineRule || 'auto';
                    let cssValue = '2.0'; // Default fallback matching baseLineFactor

                    // Debug: Add visible tooltip to inspect values
                    const debugTitle = `SB:${attributes.spacingBefore || '-'} SA:${attributes.spacingAfter || '-'} LH:${attributes.lineHeight || '-'} LR:${lineRule}`;

                    if (lineRule === 'exact') {
                        // Fixed line height in points (twips / 20)
                        const ptValue = lineValue / 20;
                        cssValue = `${ptValue}pt`;
                    } else if (lineRule === 'atLeast') {
                        // Minimum line height
                        const ptValue = lineValue / 20;
                        cssValue = `${ptValue}pt`;
                    } else {
                        // lineRule === 'auto' (Multiplier mode 240ths)
                        // Increased from 1.3 to 2.0 to better match Japanese line spacing expectations
                        const docxMultiplier = lineValue / 240;
                        const baseLineFactor = 2.0;
                        cssValue = (docxMultiplier * baseLineFactor).toFixed(3);
                    }

                    return {
                        'data-line-height': attributes.lineHeight,
                        'data-line-rule': lineRule,
                        style: `line-height: ${cssValue};`,
                        title: debugTitle, // Debug tooltip
                    };
                },
            },
            lineRule: {
                default: null,
                parseHTML: element => element.getAttribute('data-line-rule'),
                renderHTML: attributes => {
                    if (!attributes.lineRule) return {};
                    return { 'data-line-rule': attributes.lineRule };
                }
            },
            // Paragraph default font properties for DOCX w:pPr/w:rPr
            pPrFontSize: {
                default: null,
                parseHTML: element => element.getAttribute('data-ppr-font-size'),
                renderHTML: attributes => {
                    if (!attributes.pPrFontSize) return {};
                    return { 'data-ppr-font-size': attributes.pPrFontSize };
                }
            },
            pPrFontFamily: {
                default: null,
                parseHTML: element => element.getAttribute('data-ppr-font-family'),
                renderHTML: attributes => {
                    if (!attributes.pPrFontFamily) return {};
                    return { 'data-ppr-font-family': attributes.pPrFontFamily };
                }
            },
            // Keep Next / Keep Lines (overrides style outline behavior)
            keepNext: {
                default: null,
                parseHTML: element => element.getAttribute('data-keep-next'),
                renderHTML: attributes => {
                    if (attributes.keepNext === null) return {};
                    return { 'data-keep-next': attributes.keepNext };
                }
            },
            keepLines: {
                default: null,
                parseHTML: element => element.getAttribute('data-keep-lines'),
                renderHTML: attributes => {
                    if (attributes.keepLines === null) return {};
                    return { 'data-keep-lines': attributes.keepLines };
                }
            },
            // Contextual spacing (remove space between same-style paragraphs)
            contextualSpacing: {
                default: null,
                parseHTML: element => element.getAttribute('data-contextual-spacing'),
                renderHTML: attributes => {
                    if (!attributes.contextualSpacing) return {};
                    return { 'data-contextual-spacing': attributes.contextualSpacing };
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
