/* eslint-disable @typescript-eslint/no-explicit-any */
import { ToolDefinition, createTool, ToolContext } from '../types';
import { hasDeletionMark } from './utils';

export const getTableTools = (context: ToolContext): ToolDefinition[] => {
    return [
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
                    },
                    trackChanges: {
                        type: 'boolean',
                        description: 'Whether to track changes for this insertion.'
                    }
                },
                required: ['headers', 'rows'],
                additionalProperties: false
            },
            async ({ headers, rows, withHeaderRow = true, afterText, trackChanges }: { headers: string[], rows: string[][], withHeaderRow?: boolean, afterText?: string, trackChanges?: boolean }) => {
                const { getEditor, superdoc } = context;
                const editor = getEditor();
                if (!editor) throw new Error('Editor not initialized');

                // Handle track changes mode
                if (superdoc?.setDocumentMode) {
                    if (trackChanges === true) {
                        superdoc.setDocumentMode('suggesting');
                    } else if (trackChanges === false) {
                        superdoc.setDocumentMode('editing');
                    }
                }

                try {
                    // Find insert position - we need the position AFTER the block containing afterText
                    let insertPos = -1;
                    const foundBlockInfo = { endPos: -1, text: '' };

                    if (afterText) {
                        const normalizedTarget = afterText.toLowerCase();

                        // Search for the text and find the end of its containing block
                        // Skip text nodes with deletion marks (track changes)
                        editor.state.doc.descendants((node: any, pos: number) => {
                            if (foundBlockInfo.endPos > -1) return false;

                            if (node.isText && !hasDeletionMark(node)) {
                                const textContent = node.text!.toLowerCase();
                                const idx = textContent.indexOf(normalizedTarget);
                                if (idx > -1) {
                                    // Found the text, now find the end of its parent block
                                    const $pos = editor.state.doc.resolve(pos + idx);
                                    for (let d = $pos.depth; d > 0; d--) {
                                        const parentNode = $pos.node(d);
                                        if (parentNode.isBlock) {
                                            foundBlockInfo.endPos = $pos.after(d);
                                            foundBlockInfo.text = parentNode.textContent?.substring(0, 50) || '';
                                            console.log(`[insertTable] Found "${afterText}" in block ending at ${foundBlockInfo.endPos}`);
                                            break;
                                        }
                                    }
                                    return false;
                                }
                            }
                            return true;
                        });

                        // Fallback: if user asked for "title" but we didn't find it, look for first Heading
                        if (foundBlockInfo.endPos === -1 && normalizedTarget.includes('title')) {
                            console.log('[insertTable] "title" text not found, looking for Heading node...');
                            editor.state.doc.descendants((node: any, pos: number) => {
                                if (foundBlockInfo.endPos > -1) return false;
                                if (node.type.name === 'heading') {
                                    foundBlockInfo.endPos = pos + node.nodeSize;
                                    foundBlockInfo.text = node.textContent?.substring(0, 50) || '';
                                    return false;
                                }
                                return true;
                            });
                        }

                        if (foundBlockInfo.endPos > -1) {
                            insertPos = foundBlockInfo.endPos;
                        } else {
                            console.warn(`[insertTable] Text "${afterText}" not found. Inserting at end of document.`);
                            insertPos = editor.state.doc.content.size;
                        }
                    } else {
                        // No afterText specified - use current cursor position or end of document
                        insertPos = editor.state.selection.to;
                    }

                    console.log(`[insertTable] Final insert position: ${insertPos}`);

                    // Build table structure for TipTap
                    const totalRows = (withHeaderRow ? 1 : 0) + rows.length;
                    const totalCols = headers.length || (rows[0]?.length || 1);

                    // Create table node content
                    const tableRows: any[] = [];

                    // Header row
                    if (headers.length > 0) {
                        const headerCells = headers.map(h => ({
                            type: withHeaderRow ? 'tableHeader' : 'tableCell',
                            content: [{ type: 'paragraph', content: h ? [{ type: 'text', text: String(h) }] : [] }]
                        }));
                        tableRows.push({ type: 'tableRow', content: headerCells });
                    }

                    // Data rows
                    for (const row of rows) {
                        const cells = row.map(cell => ({
                            type: 'tableCell',
                            content: [{ type: 'paragraph', content: cell ? [{ type: 'text', text: String(cell) }] : [] }]
                        }));
                        // Ensure row has correct number of cells
                        while (cells.length < totalCols) {
                            cells.push({ type: 'tableCell', content: [{ type: 'paragraph', content: [] }] });
                        }
                        tableRows.push({ type: 'tableRow', content: cells });
                    }

                    const tableNode = {
                        type: 'table',
                        content: tableRows
                    };

                    // Insert the table at the calculated position
                    if (editor.commands.insertContentAt) {
                        editor.commands.insertContentAt(insertPos, tableNode);
                    } else if (editor.commands.insertContent) {
                        // Fallback: set selection then insert
                        editor.commands.setTextSelection(insertPos);
                        editor.commands.insertContent(tableNode);
                    } else {
                        throw new Error('No insertContentAt or insertContent command available');
                    }

                    return `Inserted ${totalCols}x${totalRows} table${afterText ? ` after "${afterText}"` : ' at cursor'}. Headers: ${headers.join(', ')}.`;

                } catch (error) {
                    console.error('[insertTable] Error:', error);

                    // Fallback: try inserting at current cursor position with native command
                    try {
                        const totalRows = (withHeaderRow ? 1 : 0) + rows.length;
                        const totalCols = headers.length || (rows[0]?.length || 1);

                        if (editor.commands.insertTable) {
                            editor.commands.insertTable({
                                rows: totalRows,
                                cols: totalCols,
                                withHeaderRow
                            });
                            return `Inserted ${totalCols}x${totalRows} empty table at cursor (fallback mode). Headers: ${headers.join(', ')}. Note: Please populate cells manually.`;
                        }
                    } catch (fallbackError) {
                        console.error('[insertTable] Fallback also failed:', fallbackError);
                    }

                    return `Failed to insert table: ${error instanceof Error ? error.message : 'Unknown error'}`;
                }
            }
        )
    ];
};
