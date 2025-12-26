/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { ToolDefinition, createTool, ToolContext } from './types';

/**
 * Check if a text node has a deletion mark (track changes).
 * Used to skip deleted text when searching for content.
 */
const hasDeletionMark = (node: any): boolean => {
    if (!node.marks?.length) return false;
    return node.marks.some((mark: any) => {
        const markName = mark.type.name.toLowerCase();
        return markName.includes('deletion') ||
            markName.includes('delete') ||
            (markName.includes('trackchange') && mark.attrs?.type === 'deletion');
    });
};

export const getFormattingTools = (context: ToolContext): ToolDefinition[] => {
    const { getEditor, getActionMethods } = context;

    return [
        createTool(
            'setTextAlignment',
            'Set text alignment for the current selection.',
            {
                type: 'object',
                properties: { alignment: { type: 'string', enum: ['left', 'center', 'right', 'justify'] } },
                required: ['alignment'],
                additionalProperties: false
            },
            async ({ alignment }: { alignment: string }) => {
                const editor = getEditor();
                if (!editor) throw new Error('Editor not initialized');
                try {
                    if (typeof editor.focus === 'function') editor.focus();
                    editor.chain().setTextAlign(alignment).run();
                    return `Set text alignment to ${alignment}`;
                } catch (error) {
                    console.error('[setTextAlignment] Error:', error);
                    return `Failed to set alignment: ${error instanceof Error ? error.message : 'Unknown error'}`;
                }
            }
        ),
        createTool(
            'setTextIndent',
            'Set text indentation (e.g. "20px", "2em").',
            {
                type: 'object',
                properties: { indent: { type: 'string' } },
                required: ['indent'],
                additionalProperties: false
            },
            async ({ indent }: { indent: string }) => {
                const editor = getEditor();
                if (!editor) throw new Error('Editor not initialized');
                if (editor.commands.setTextIndent) {
                    try {
                        if (typeof editor.focus === 'function') editor.focus();
                        editor.chain().setTextIndent(indent).run();
                        return `Set text indent to ${indent}`;
                    } catch (error) {
                        console.error('[setTextIndent] Error:', error);
                        return `Failed to set indent: ${error instanceof Error ? error.message : 'Unknown error'}`;
                    }
                }
                return 'setTextIndent command not supported by current editor configuration.';
            }
        ),
        createTool(
            'setLineHeight',
            'Set line height (e.g. "1.5", "150%").',
            {
                type: 'object',
                properties: { height: { type: 'string' } },
                required: ['height'],
                additionalProperties: false
            },
            async ({ height }: { height: string }) => {
                const editor = getEditor();
                if (!editor) throw new Error('Editor not initialized');
                if (editor.commands.setLineHeight) {
                    try {
                        if (typeof editor.focus === 'function') editor.focus();
                        editor.chain().setLineHeight(height).run();
                        return `Set line height to ${height}`;
                    } catch (error) {
                        console.error('[setLineHeight] Error:', error);
                        return `Failed to set line height: ${error instanceof Error ? error.message : 'Unknown error'}. The editor may be in an unstable state.`;
                    }
                }
                return 'setLineHeight command not supported.';
            }
        ),
        createTool(
            'setFontSize',
            'Set font size (e.g. "12pt", "16px").',
            {
                type: 'object',
                properties: { size: { type: 'string' } },
                required: ['size'],
                additionalProperties: false
            },
            async ({ size }: { size: string }) => {
                const editor = getEditor();
                if (!editor) throw new Error('Editor not initialized');
                if (editor.commands.setFontSize) {
                    try {
                        if (typeof editor.focus === 'function') editor.focus();
                        editor.chain().setFontSize(size).run();
                        return `Set font size to ${size}`;
                    } catch (error) {
                        console.error('[setFontSize] Error:', error);
                        return `Failed to set font size: ${error instanceof Error ? error.message : 'Unknown error'}`;
                    }
                }
                return 'setFontSize command not supported.';
            }
        ),
        createTool(
            'applyStyle',
            'Apply custom text style (CSS property and value).',
            {
                type: 'object',
                properties: {
                    property: { type: 'string', description: 'CSS property name (camelCase), e.g. color, backgroundColor' },
                    value: { type: 'string', description: 'CSS value' }
                },
                required: ['property', 'value'],
                additionalProperties: false
            },
            async ({ property, value }: { property: string, value: string }) => {
                const editor = getEditor();
                if (!editor) throw new Error('Editor not initialized');
                try {
                    if (typeof editor.focus === 'function') editor.focus();
                    editor.chain().setMark('textStyle', { [property]: value }).run();
                    return `Applied style ${property}: ${value}`;
                } catch (error) {
                    console.error('[applyStyle] Error:', error);
                    return `Failed to apply style ${property}: ${error instanceof Error ? error.message : 'Unknown error'}`;
                }
            }
        ),
        createTool(
            'selectText',
            'Select the first occurrence of the specified text to prepare for formatting.',
            {
                type: 'object',
                properties: { text: { type: 'string' } },
                required: ['text'],
                additionalProperties: false
            },
            async ({ text }: { text: string }) => {
                const editor = getEditor();
                if (!editor) {
                    console.error('[DocEditor] selectText: Editor not found');
                    throw new Error('Editor not initialized (selectText)');
                }

                console.log('[DocEditor] selectText searching for:', text);
                let foundFrom = -1;
                let foundTo = -1;

                editor.state.doc.descendants((node: any, pos: number) => {
                    if (foundFrom > -1) return false;
                    // Skip text nodes with deletion marks (track changes)
                    if (node.isText && !hasDeletionMark(node)) {
                        const textContent = node.text!;
                        const idx = textContent.indexOf(text);
                        if (idx > -1) {
                            foundFrom = pos + idx;
                            foundTo = foundFrom + text.length;
                            return false;
                        }
                    }
                    return true;
                });

                if (foundFrom > -1) {
                    console.log(`[DocEditor] selectText found at ${foundFrom}-${foundTo}`);
                    try {
                        if (typeof editor.focus === 'function') editor.focus();
                        editor.chain().setTextSelection({ from: foundFrom, to: foundTo }).run();
                        return `Selected text: "${text}"`;
                    } catch (e) {
                        console.error('[DocEditor] selectText failed to set selection:', e);
                        throw e;
                    }
                }
                console.warn('[DocEditor] selectText: Text not found');
                return `Text "${text}" not found.`;
            }
        ),
        createTool(
            'highlightText',
            'Find and highlight ALL occurrences of specific text with a background color.',
            {
                type: 'object',
                properties: {
                    text: {
                        type: 'string',
                        description: 'The text to find and highlight (e.g., "GDPR clause", "Section 3")'
                    },
                    color: {
                        type: 'string',
                        description: 'Hex color for highlight (default: #FFEB3B yellow). Examples: #FFEB3B (yellow), #90EE90 (light green), #87CEEB (light blue), #FFB6C1 (light pink)'
                    }
                },
                required: ['text'],
                additionalProperties: false
            },
            async ({ text, color }: { text: string; color?: string }) => {
                const editor = getEditor();
                if (!editor) throw new Error('Editor not initialized');

                const highlightColor = color || '#FFEB3B';

                // Find all occurrences of the text in the document
                const matches: { from: number; to: number }[] = [];
                const searchText = text.toLowerCase();

                editor.state.doc.descendants((node: any, pos: number) => {
                    // Skip text nodes with deletion marks (track changes)
                    if (node.isText && !hasDeletionMark(node)) {
                        const nodeText = node.text!.toLowerCase();
                        let idx = 0;
                        while ((idx = nodeText.indexOf(searchText, idx)) !== -1) {
                            matches.push({
                                from: pos + idx,
                                to: pos + idx + text.length
                            });
                            idx += text.length;
                        }
                    }
                    return true;
                });

                if (matches.length === 0) {
                    return `Text "${text}" not found in document.`;
                }

                // Apply highlight to all matches
                // IMPORTANT: Apply in REVERSE order (from end to start) so position shifts
                // don't affect subsequent matches
                try {
                    if (typeof editor.focus === 'function') editor.focus();

                    // Sort by position descending and apply in reverse order
                    matches.sort((a, b) => b.from - a.from);

                    for (const match of matches) {
                        editor.chain()
                            .setTextSelection({ from: match.from, to: match.to })
                            .setHighlight(highlightColor)
                            .run();
                    }

                    return `Highlighted ${matches.length} occurrence(s) of "${text}" with color ${highlightColor}`;
                } catch (error) {
                    console.error('[highlightText] Error:', error);
                    return `Failed to highlight "${text}": ${error instanceof Error ? error.message : 'Unknown error'}`;
                }
            }
        ),
        createTool(
            'setHighlight',
            'Apply highlight to the current text selection. Use selectText first to select the text.',
            {
                type: 'object',
                properties: {
                    color: {
                        type: 'string',
                        description: 'Hex color for highlight (default: #FFEB3B yellow)'
                    }
                },
                required: [],
                additionalProperties: false
            },
            async ({ color }: { color?: string }) => {
                const editor = getEditor();
                if (!editor) throw new Error('Editor not initialized');
                const highlightColor = color || '#FFEB3B';
                if (typeof editor.focus === 'function') editor.focus();
                editor.commands.setHighlight(highlightColor);
                return `Applied highlight with color ${highlightColor}`;
            }
        ),
        createTool(
            'unsetHighlight',
            'Remove highlight from the current text selection.',
            {
                type: 'object',
                properties: {},
                required: [],
                additionalProperties: false
            },
            async () => {
                const editor = getEditor();
                if (!editor) throw new Error('Editor not initialized');
                if (typeof editor.focus === 'function') editor.focus();
                editor.commands.unsetHighlight();
                return 'Removed highlight from selection';
            }
        ),
        createTool(
            'setFontFamily',
            'Set font family for text. Common Japanese fonts: "MS Gothic" (ＭＳ ゴシック), "MS PGothic" (ＭＳ Ｐゴシック), "MS Mincho" (ＭＳ 明朝), "MS PMincho" (ＭＳ Ｐ明朝), "Yu Gothic", "Yu Mincho", "Meiryo". Can apply to entire document, specific text, or current selection.',
            {
                type: 'object',
                properties: {
                    fontFamily: {
                        type: 'string',
                        description: 'Font family name. For Japanese legal documents, use "MS Gothic" for headings (ゴシック体) and "MS Mincho" for body text (明朝体).'
                    },
                    find: {
                        type: 'string',
                        description: 'Optional: Text to find and apply font to. If not provided, applies to entire document or current selection.'
                    },
                    applyToEntireDocument: {
                        type: 'boolean',
                        description: 'If true, applies font to ALL text in the document. Useful for setting a consistent font across the entire document (default: false).'
                    }
                },
                required: ['fontFamily'],
                additionalProperties: false
            },
            async ({ fontFamily, find, applyToEntireDocument = false }: { fontFamily: string; find?: string; applyToEntireDocument?: boolean }) => {
                const editor = getEditor();
                if (!editor) throw new Error('Editor not initialized');

                try {
                    if (typeof editor.focus === 'function') editor.focus();

                    // Apply to entire document
                    if (applyToEntireDocument) {
                        const doc = editor.state.doc;
                        const textRanges: { from: number; to: number }[] = [];

                        // Collect all text node positions
                        doc.descendants((node: any, pos: number) => {
                            if (node.isText && !hasDeletionMark(node)) {
                                textRanges.push({
                                    from: pos,
                                    to: pos + node.text!.length
                                });
                            }
                            return true;
                        });

                        if (textRanges.length === 0) {
                            return 'No text found in document.';
                        }

                        // Apply font in reverse order to preserve positions
                        textRanges.sort((a, b) => b.from - a.from);

                        for (const range of textRanges) {
                            editor.chain()
                                .setTextSelection({ from: range.from, to: range.to })
                                .setFontFamily(fontFamily)
                                .run();
                        }

                        return `Set font family to "${fontFamily}" for entire document (${textRanges.length} text segments).`;
                    }

                    // If find is provided, select the text first
                    if (find) {
                        let foundFrom = -1;
                        let foundTo = -1;

                        editor.state.doc.descendants((node: any, pos: number) => {
                            if (foundFrom > -1) return false;
                            if (node.isText && !hasDeletionMark(node)) {
                                const textContent = node.text!;
                                const idx = textContent.indexOf(find);
                                if (idx > -1) {
                                    foundFrom = pos + idx;
                                    foundTo = foundFrom + find.length;
                                    return false;
                                }
                            }
                            return true;
                        });

                        if (foundFrom === -1) {
                            return `Text "${find}" not found in document.`;
                        }

                        editor.chain().setTextSelection({ from: foundFrom, to: foundTo }).setFontFamily(fontFamily).run();
                        return `Set font family to "${fontFamily}" for text "${find}"`;
                    }

                    // Apply to current selection
                    editor.chain().setFontFamily(fontFamily).run();
                    return `Set font family to "${fontFamily}"`;
                } catch (error) {
                    console.error('[setFontFamily] Error:', error);
                    return `Failed to set font family: ${error instanceof Error ? error.message : 'Unknown error'}`;
                }
            }
        ),
        createTool(
            'convertToFullWidth',
            'Convert half-width numbers and letters to full-width (半角→全角). Essential for Japanese legal documents where 全角アラビア数字 is required. Can target specific text or all text in document.',
            {
                type: 'object',
                properties: {
                    find: {
                        type: 'string',
                        description: 'Optional: Specific text to find and convert. If not provided, converts ALL half-width characters in the document.'
                    },
                    convertNumbers: {
                        type: 'boolean',
                        description: 'Convert numbers 0-9 to ０-９ (default: true)'
                    },
                    convertLetters: {
                        type: 'boolean',
                        description: 'Convert letters A-Z, a-z to Ａ-Ｚ, ａ-ｚ (default: false)'
                    },
                    convertSpace: {
                        type: 'boolean',
                        description: 'Convert half-width space to full-width space (default: false)'
                    }
                },
                required: [],
                additionalProperties: false
            },
            async ({ find, convertNumbers = true, convertLetters = false, convertSpace = false }: {
                find?: string;
                convertNumbers?: boolean;
                convertLetters?: boolean;
                convertSpace?: boolean;
            }) => {
                const editor = getEditor();
                if (!editor) throw new Error('Editor not initialized');

                // Half-width to full-width conversion function
                const toFullWidth = (str: string): string => {
                    let result = '';
                    for (let i = 0; i < str.length; i++) {
                        const code = str.charCodeAt(i);
                        // Numbers: 0-9 (0x30-0x39) → ０-９ (0xFF10-0xFF19)
                        if (convertNumbers && code >= 0x30 && code <= 0x39) {
                            result += String.fromCharCode(code + 0xFEE0);
                        }
                        // Uppercase letters: A-Z (0x41-0x5A) → Ａ-Ｚ (0xFF21-0xFF3A)
                        else if (convertLetters && code >= 0x41 && code <= 0x5A) {
                            result += String.fromCharCode(code + 0xFEE0);
                        }
                        // Lowercase letters: a-z (0x61-0x7A) → ａ-ｚ (0xFF41-0xFF5A)
                        else if (convertLetters && code >= 0x61 && code <= 0x7A) {
                            result += String.fromCharCode(code + 0xFEE0);
                        }
                        // Space: (0x20) → 　 (0x3000)
                        else if (convertSpace && code === 0x20) {
                            result += String.fromCharCode(0x3000);
                        }
                        else {
                            result += str[i];
                        }
                    }
                    return result;
                };

                // Check if a string has any half-width characters to convert
                const hasHalfWidth = (str: string): boolean => {
                    for (let i = 0; i < str.length; i++) {
                        const code = str.charCodeAt(i);
                        if (convertNumbers && code >= 0x30 && code <= 0x39) return true;
                        if (convertLetters && code >= 0x41 && code <= 0x5A) return true;
                        if (convertLetters && code >= 0x61 && code <= 0x7A) return true;
                        if (convertSpace && code === 0x20) return true;
                    }
                    return false;
                };

                try {
                    if (typeof editor.focus === 'function') editor.focus();

                    if (find) {
                        // Convert specific text
                        const converted = toFullWidth(find);
                        if (converted === find) {
                            return `Text "${find}" has no half-width characters to convert.`;
                        }

                        // Find and replace
                        let foundFrom = -1;
                        let foundTo = -1;

                        editor.state.doc.descendants((node: any, pos: number) => {
                            if (foundFrom > -1) return false;
                            if (node.isText && !hasDeletionMark(node)) {
                                const textContent = node.text!;
                                const idx = textContent.indexOf(find);
                                if (idx > -1) {
                                    foundFrom = pos + idx;
                                    foundTo = foundFrom + find.length;
                                    return false;
                                }
                            }
                            return true;
                        });

                        if (foundFrom === -1) {
                            return `Text "${find}" not found in document.`;
                        }

                        editor.chain()
                            .setTextSelection({ from: foundFrom, to: foundTo })
                            .insertContent(converted)
                            .run();

                        return `Converted "${find}" → "${converted}"`;
                    } else {
                        // Convert all half-width characters in document
                        // Find all text nodes with half-width characters
                        const replacements: { from: number; to: number; original: string; converted: string }[] = [];

                        editor.state.doc.descendants((node: any, pos: number) => {
                            if (node.isText && !hasDeletionMark(node)) {
                                const text = node.text!;
                                if (hasHalfWidth(text)) {
                                    replacements.push({
                                        from: pos,
                                        to: pos + text.length,
                                        original: text,
                                        converted: toFullWidth(text)
                                    });
                                }
                            }
                            return true;
                        });

                        if (replacements.length === 0) {
                            return 'No half-width characters found in document.';
                        }

                        // Apply in reverse order to preserve positions
                        replacements.sort((a, b) => b.from - a.from);

                        for (const r of replacements) {
                            editor.chain()
                                .setTextSelection({ from: r.from, to: r.to })
                                .insertContent(r.converted)
                                .run();
                        }

                        const convTypes: string[] = [];
                        if (convertNumbers) convTypes.push('numbers');
                        if (convertLetters) convTypes.push('letters');
                        if (convertSpace) convTypes.push('spaces');

                        return `Converted ${replacements.length} text segment(s) from half-width to full-width (${convTypes.join(', ')}).`;
                    }
                } catch (error) {
                    console.error('[convertToFullWidth] Error:', error);
                    return `Failed to convert: ${error instanceof Error ? error.message : 'Unknown error'}`;
                }
            }
        ),
        createTool(
            'acceptAllChanges',
            'Accept all tracked changes (insertions and deletions) in the document, finalizing them as permanent content.',
            {
                type: 'object',
                properties: {},
                required: [],
                additionalProperties: false
            },
            async () => {
                const editor = getEditor();
                if (!editor) throw new Error('Editor not initialized');

                try {
                    if (typeof editor.focus === 'function') editor.focus();

                    if (typeof editor.commands.acceptAllChanges === 'function') {
                        editor.commands.acceptAllChanges();
                        return 'Accepted all tracked changes in the document.';
                    } else {
                        return 'acceptAllChanges command not available. Track changes extension may not be loaded.';
                    }
                } catch (error) {
                    console.error('[acceptAllChanges] Error:', error);
                    return `Failed to accept changes: ${error instanceof Error ? error.message : 'Unknown error'}`;
                }
            }
        ),
        createTool(
            'rejectAllChanges',
            'Reject all tracked changes (insertions and deletions) in the document, reverting to the original content.',
            {
                type: 'object',
                properties: {},
                required: [],
                additionalProperties: false
            },
            async () => {
                const editor = getEditor();
                if (!editor) throw new Error('Editor not initialized');

                try {
                    if (typeof editor.focus === 'function') editor.focus();

                    if (typeof editor.commands.rejectAllChanges === 'function') {
                        editor.commands.rejectAllChanges();
                        return 'Rejected all tracked changes in the document.';
                    } else {
                        return 'rejectAllChanges command not available. Track changes extension may not be loaded.';
                    }
                } catch (error) {
                    console.error('[rejectAllChanges] Error:', error);
                    return `Failed to reject changes: ${error instanceof Error ? error.message : 'Unknown error'}`;
                }
            }
        )
    ];
};
