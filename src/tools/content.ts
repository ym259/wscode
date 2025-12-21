import { ToolDefinition, createTool, ToolContext } from './types';
import { escapeHtml, findFileHandle } from './utils';
import { AIActions } from '@superdoc-dev/ai';

export const getContentTools = (context: ToolContext): ToolDefinition[] => {
    const { getActionMethods, getEditor, workspaceFiles, activeFilePath, activeFileHandle, setCellValue } = context;

    return [
        createTool(
            'insertTrackedChanges',
            // ... (keep implies I will skip this, but I should use multi_replace or specific target)
            // But I'm better off using separate edits for destructuring and tool impl.
            // I'll update destructuring first.

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
            'editText',
            'Find text and optionally replace it, then apply formatting styles. The primary tool for text editing and styling. For style-only operations (no text change), omit the "replace" parameter.',
            {
                type: 'object',
                properties: {
                    find: { type: 'string', description: 'Text to find (e.g., "**important**" for markdown bold, or just "Title" to apply styles without replacement)' },
                    replace: { type: 'string', description: 'Optional: Replacement text. If omitted, text is not replaced (style-only mode).' },
                    trackChanges: { type: 'boolean', description: 'Whether to track changes (only applies if text is replaced)' },
                    headingLevel: {
                        type: 'integer',
                        enum: [1, 2, 3, 4, 5, 6],
                        description: 'Apply heading style (1-6).'
                    },
                    bold: {
                        type: 'boolean',
                        description: 'Apply bold formatting.'
                    },
                    italic: {
                        type: 'boolean',
                        description: 'Apply italic formatting.'
                    },
                    underline: {
                        type: 'boolean',
                        description: 'Apply underline formatting.'
                    },
                    strikethrough: {
                        type: 'boolean',
                        description: 'Apply strikethrough formatting.'
                    },
                    code: {
                        type: 'boolean',
                        description: 'Apply inline code formatting.'
                    }
                },
                required: ['find'],
                additionalProperties: false
            },
            async ({ find, replace, trackChanges, headingLevel, bold, italic, underline, strikethrough, code }: {
                find: string,
                replace?: string,
                trackChanges?: boolean,
                headingLevel?: number,
                bold?: boolean,
                italic?: boolean,
                underline?: boolean,
                strikethrough?: boolean,
                code?: boolean
            }) => {
                const editor = getEditor();
                if (!editor) throw new Error('Editor not initialized');

                // Determine effective replacement text (defaults to find for style-only)
                const effectiveReplace = replace !== undefined ? replace : find;
                const isReplacing = replace !== undefined && replace !== find;

                let result = '';

                // Only call literalReplace if actually replacing text
                if (isReplacing) {
                    result = await getActionMethods().literalReplace(find, effectiveReplace, trackChanges);
                } else {
                    result = `Found "${find}"`;
                }

                // Check if any styling needs to be applied
                const hasStyles = headingLevel || bold || italic || underline || strikethrough || code;

                // Find the position of the text (either original or replaced)
                const searchText = effectiveReplace.toLowerCase();
                let foundFrom = -1;
                let foundTo = -1;

                editor.state.doc.descendants((node: any, pos: number) => {
                    if (foundFrom > -1) return false;
                    if (node.isText) {
                        const nodeText = node.text!.toLowerCase();
                        const idx = nodeText.indexOf(searchText);
                        if (idx > -1) {
                            foundFrom = pos + idx;
                            foundTo = foundFrom + effectiveReplace.length;
                            return false;
                        }
                    }
                    return true;
                });

                if (foundFrom === -1) {
                    return `Text "${find}" not found in document.`;
                }

                if (hasStyles) {
                    // Build a chain of formatting commands
                    let chain = editor.chain().setTextSelection({ from: foundFrom, to: foundTo });
                    const appliedStyles: string[] = [];

                    // Apply heading if specified
                    if (headingLevel && headingLevel >= 1 && headingLevel <= 6) {
                        chain = chain.toggleHeading({ level: headingLevel as any });
                        appliedStyles.push(`Heading ${headingLevel}`);
                    }

                    // Apply inline styles
                    if (bold) {
                        chain = chain.setBold();
                        appliedStyles.push('bold');
                    }
                    if (italic) {
                        chain = chain.setItalic();
                        appliedStyles.push('italic');
                    }
                    if (underline) {
                        chain = chain.setUnderline();
                        appliedStyles.push('underline');
                    }
                    if (strikethrough) {
                        chain = chain.setStrike();
                        appliedStyles.push('strikethrough');
                    }
                    if (code) {
                        chain = chain.setCode();
                        appliedStyles.push('code');
                    }

                    chain.run();

                    if (appliedStyles.length > 0) {
                        if (isReplacing) {
                            return `Replaced "${find}" with "${effectiveReplace}" and applied ${appliedStyles.join(', ')}`;
                        } else {
                            return `Applied ${appliedStyles.join(', ')} to "${find}"`;
                        }
                    }
                }

                return result;
            }
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
        ),
        createTool(
            'editSpreadsheet',
            'Edit specific cells in an Excel spreadsheet. Requires a list of edits. If path is omitted, edits the active file.',
            {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Relative path to the xlsx file. Optional if an xlsx file is currently open.' },
                    edits: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                sheet: { type: 'string', description: 'Sheet name (optional, defaults to first sheet)' },
                                cell: { type: 'string', description: 'Cell address (e.g., "A1", "B2")' },
                                value: { type: 'string', description: 'New value' },
                                isNumber: { type: 'boolean', description: 'Set to true if value should be treated as a number' }
                            },
                            required: ['cell', 'value']
                        }
                    }
                },
                required: ['edits'],
                additionalProperties: false
            },
            async ({ path, edits }: {
                path?: string,
                edits: Array<{ sheet?: string, cell: string, value: string, isNumber?: boolean }>
            }) => {
                // Validate edits input
                if (!edits || !Array.isArray(edits)) {
                    return 'Error: edits parameter is required and must be an array. Example: edits: [{ cell: "A7", value: "hello" }]';
                }
                if (edits.length === 0) {
                    return 'Error: edits array is empty. Please specify at least one cell to edit.';
                }

                // If setCellValue callback is available, use it for live UI updates
                if (setCellValue) {
                    let editsApplied = 0;
                    for (const edit of edits) {
                        const value = edit.isNumber ? parseFloat(edit.value) || edit.value : edit.value;
                        setCellValue(edit.cell, value as string | number, edit.sheet, edit.isNumber);
                        editsApplied++;
                    }
                    console.log(`[editSpreadsheet] Applied ${editsApplied} edits via live callback`);
                    return `Successfully applied ${editsApplied} edits to the spreadsheet. Changes are visible immediately.`;
                }

                // Fallback: Write directly to file (requires file handle)
                if (!workspaceFiles && !activeFileHandle) return 'No workspace access available.';

                const targetPath = path || activeFilePath;
                if (!targetPath) {
                    return 'Error: No path provided and no active file found. Please specify the file path.';
                }

                // Ensure target is an xlsx file
                if (!targetPath.endsWith('.xlsx')) {
                    return `Error: Target file '${targetPath}' is not an .xlsx file.`;
                }

                let handle: any = null;

                // Use active handle if available and path matches active file (or path was inferred)
                if (activeFileHandle && (targetPath === activeFilePath || !path)) {
                    handle = activeFileHandle;
                } else if (workspaceFiles) {
                    handle = findFileHandle(workspaceFiles, targetPath);
                }

                if (!handle) {
                    return `File not found: ${targetPath}. Please check the path.`;
                }

                try {
                    const XLSX = await import('xlsx');
                    const file = await handle.getFile();
                    const arrayBuffer = await file.arrayBuffer();
                    const workbook = XLSX.read(arrayBuffer, { type: 'array' });

                    let editsApplied = 0;

                    for (const edit of edits) {
                        const sheetName = edit.sheet || workbook.SheetNames[0];
                        if (!workbook.Sheets[sheetName]) {
                            continue; // Skip invalid sheets
                        }

                        const worksheet = workbook.Sheets[sheetName];
                        const cellAddress = edit.cell.toUpperCase();

                        // Parse value (number or string)
                        let cellValue: string | number | boolean = edit.value;
                        if (edit.isNumber) {
                            const num = parseFloat(edit.value);
                            if (!isNaN(num)) cellValue = num;
                        }

                        // Update cell
                        XLSX.utils.sheet_add_aoa(worksheet, [[cellValue]], { origin: cellAddress });
                        editsApplied++;
                    }

                    // Write back to file
                    const xlsxData = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
                    const blob = new Blob([xlsxData], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

                    const writable = await handle.createWritable();
                    await writable.write(blob);
                    await writable.close();

                    return `Successfully applied ${editsApplied} edits to ${path}. Please reload the file to see changes.`;
                } catch (error) {
                    console.error('[editSpreadsheet] Error:', error);
                    return `Error editing spreadsheet: ${error instanceof Error ? error.message : 'Unknown error'}`;
                }
            }
        )
    ];
};
