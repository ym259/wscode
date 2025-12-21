import { ToolDefinition, createTool, ToolContext } from './types';

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
                    if (node.isText) {
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
                    if (node.isText) {
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
        )
    ];
};
