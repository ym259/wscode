import { ToolDefinition, createTool, ToolContext } from './types';
import { escapeHtml } from './utils';
import { AIActions } from '@superdoc-dev/ai';

export const getContentTools = (context: ToolContext): ToolDefinition[] => {
    const { getActionMethods, getEditor } = context;

    return [
        createTool(
            'insertTrackedChanges',
            'Suggest edits using track changes. Automatically finds target content.',
            {
                type: 'object',
                properties: { instruction: { type: 'string' } },
                required: ['instruction'],
                additionalProperties: false
            },
            async ({ instruction }: { instruction: string }) => await getActionMethods().insertTrackedChange(instruction)
        ),
        createTool(
            'insertComments',
            'Add comments to the document.',
            {
                type: 'object',
                properties: { instruction: { type: 'string' } },
                required: ['instruction'],
                additionalProperties: false
            },
            async ({ instruction }: { instruction: string }) => await getActionMethods().insertComments(instruction)
        ),
        createTool(
            'insertContent',
            'Insert new content relative to selection.',
            {
                type: 'object',
                properties: {
                    instruction: { type: 'string' },
                    args: {
                        type: 'object',
                        properties: { position: { type: 'string', enum: ['before', 'after', 'replace'] } },
                        required: ['position'],
                        additionalProperties: false
                    }
                },
                required: ['instruction', 'args'],
                additionalProperties: false
            },
            async ({ instruction, args }: { instruction: string, args?: { position: 'before' | 'after' | 'replace' } }) =>
                await getActionMethods().insertContent(instruction, args)
        ),
        createTool(
            'summarize',
            'Summarize content.',
            {
                type: 'object',
                properties: { instruction: { type: 'string' } },
                required: ['instruction'],
                additionalProperties: false
            },
            async ({ instruction }: { instruction: string }) => await getActionMethods().summarize(instruction)
        ),
        createTool(
            'literalReplace',
            'Find and replace exact text matches.',
            {
                type: 'object',
                properties: {
                    find: { type: 'string' },
                    replace: { type: 'string' },
                    trackChanges: { type: 'boolean' }
                },
                required: ['find', 'replace', 'trackChanges'],
                additionalProperties: false
            },
            async ({ find, replace, trackChanges }: { find: string, replace: string, trackChanges?: boolean }) =>
                await getActionMethods().literalReplace(find, replace, trackChanges)
        ),
        createTool(
            'literalInsertComment',
            'Add comment to exact text matches.',
            {
                type: 'object',
                properties: {
                    find: { type: 'string' },
                    comment: { type: 'string' }
                },
                required: ['find', 'comment'],
                additionalProperties: false
            },
            async ({ find, comment }: { find: string, comment: string }) => await getActionMethods().literalInsertComment(find, comment)
        ),
        createTool(
            'insertTable',
            'Insert a proper table with headers and data rows. Use this instead of markdown-style text tables. Call this tool when the user asks to insert or create a table. IMPORTANT: Use afterText to specify where the table should be inserted (e.g., the title or heading text after which to insert).',
            {
                type: 'object',
                properties: {
                    headers: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Array of column header strings'
                    },
                    rows: {
                        type: 'array',
                        items: {
                            type: 'array',
                            items: { type: 'string' }
                        },
                        description: 'Array of row arrays, each containing cell values as strings'
                    },
                    withHeaderRow: {
                        type: 'boolean',
                        description: 'Whether to style the first row as a header with bold text and background color'
                    },
                    afterText: {
                        type: 'string',
                        description: 'Text to find in the document. The table will be inserted after the paragraph/block containing this text. This is required when the user specifies a position like "after title" or "after heading".'
                    }
                },
                required: ['headers', 'rows'],
                additionalProperties: false
            },
            async ({ headers, rows, withHeaderRow = true, afterText }: { headers: string[], rows: string[][], withHeaderRow?: boolean, afterText?: string }) => {
                const editor = getEditor();
                if (!editor) throw new Error('Editor not initialized');

                // Generate HTML table
                let html = '<table border="1" style="border-collapse: collapse; width: 100%;">';

                // Header row
                if (withHeaderRow && headers.length > 0) {
                    html += '<thead><tr>';
                    for (const header of headers) {
                        html += `<th style="padding: 8px; background-color: #f0f0f0; font-weight: bold; border: 1px solid #ccc;">${escapeHtml(header)}</th>`;
                    }
                    html += '</tr></thead>';
                }

                // Data rows
                html += '<tbody>';
                for (const row of rows) {
                    html += '<tr>';
                    for (const cell of row) {
                        html += `<td style="padding: 8px; border: 1px solid #ccc;">${escapeHtml(String(cell))}</td>`;
                    }
                    html += '</tr>';
                }
                html += '</tbody></table>';

                // Find insert position
                let insertPos = editor.state.selection.to; // Default to current cursor

                if (afterText) {
                    let foundPos = -1;
                    const properties = {
                        found: false
                    };

                    // Search for text (case-insensitive)
                    const normalizedTarget = afterText.toLowerCase();

                    editor.state.doc.descendants((node: any, pos: number) => {
                        if (properties.found) return false;

                        if (node.isText) {
                            const textContent = node.text!.toLowerCase();
                            const idx = textContent.indexOf(normalizedTarget);
                            if (idx > -1) {
                                foundPos = pos + idx;
                                properties.found = true; // Use separate flag to break loop safely
                                return false;
                            }
                        }
                        return true;
                    });

                    // Fallback: if user asked for "title" but we didn't find the text "title", 
                    // try to find the first Heading level 1 or the first paragraph
                    if (!properties.found && normalizedTarget.includes('title')) {
                        console.log('[insertTable] "title" text not found, looking for Heading node...');
                        editor.state.doc.descendants((node: any, pos: number) => {
                            if (properties.found) return false;
                            if (node.type.name === 'heading') {
                                foundPos = pos + 1; // inside the heading
                                properties.found = true;
                                return false;
                            }
                            return true;
                        });
                    }

                    if (foundPos > -1) {
                        const $pos = editor.state.doc.resolve(foundPos);
                        // Walk up to find the nearest block-level parent
                        for (let d = $pos.depth; d > 0; d--) {
                            const node = $pos.node(d);
                            if (node.isBlock) {
                                insertPos = $pos.after(d);
                                console.log(`[insertTable] Found "${afterText}" (or fallback), inserting at ${insertPos}`);
                                break;
                            }
                        }
                    } else {
                        console.warn(`[insertTable] Text "${afterText}" not found. Inserting at current selection.`);
                    }
                }

                // Insert table at calculated position
                if (editor.commands.insertContentAt) {
                    editor.commands.insertContentAt(insertPos, html, { contentType: 'html' });
                } else {
                    // Fallback for older TipTap versions
                    if (insertPos !== editor.state.selection.to) {
                        editor.chain().setTextSelection(insertPos).run();
                    }
                    editor.commands.insertContent(html, { contentType: 'html' });
                }

                return `Inserted table with ${headers.length} columns and ${rows.length} data rows${afterText ? ` after "${afterText}"` : ''}`;
            }
        )
    ];
};
