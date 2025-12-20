import { ToolDefinition, createTool, ToolContext } from './types';

export const getFormattingTools = (context: ToolContext): ToolDefinition[] => {
    const { getEditor } = context;

    return [
        createTool(
            'toggleHeading',
            'Turn the current line/selection into a heading.',
            {
                type: 'object',
                properties: { level: { type: 'integer', enum: [1, 2, 3, 4, 5, 6] } },
                required: ['level'],
                additionalProperties: false
            },
            async ({ level }: { level: number }) => {
                const editor = getEditor();
                if (!editor) throw new Error('Editor not initialized');
                if (typeof editor.focus === 'function') editor.focus();
                editor.chain().toggleHeading({ level: level as any }).run();
                return `Applied Heading ${level}`;
            }
        ),
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
                if (typeof editor.focus === 'function') editor.focus();
                editor.chain().setTextAlign(alignment).run();
                return `Set text alignment to ${alignment}`;
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
                    if (typeof editor.focus === 'function') editor.focus();
                    editor.chain().setTextIndent(indent).run();
                    return `Set text indent to ${indent}`;
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
                    if (typeof editor.focus === 'function') editor.focus();
                    editor.chain().setLineHeight(height).run();
                    return `Set line height to ${height}`;
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
                    if (typeof editor.focus === 'function') editor.focus();
                    editor.chain().setFontSize(size).run();
                    return `Set font size to ${size}`;
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
                if (typeof editor.focus === 'function') editor.focus();
                editor.chain().setMark('textStyle', { [property]: value }).run();
                return `Applied style ${property}: ${value}`;
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
        )
    ];
};
