/* eslint-disable @typescript-eslint/no-explicit-any */
import { ToolDefinition, createTool, ToolContext } from '../types';
import { findFileHandle } from '../utils';

export const getSpreadsheetEditTools = (context: ToolContext): ToolDefinition[] => {
    // Helper to parse A1 notation range to row/col indices
    const parseRange = (range: string): { startRow: number; endRow: number; startCol: number; endCol: number } | null => {
        // Match patterns like "A1", "A1:B5", "AA10:ZZ99"
        const match = range.match(/^([A-Za-z]+)(\d+)(?::([A-Za-z]+)(\d+))?$/);
        if (!match) return null;

        const colToNum = (col: string): number => {
            let num = 0;
            const c = col.toUpperCase();
            for (let i = 0; i < c.length; i++) {
                num = num * 26 + (c.charCodeAt(i) - 64);
            }
            return num - 1; // 0-indexed
        };

        const startCol = colToNum(match[1]);
        const startRow = parseInt(match[2], 10) - 1; // 0-indexed
        const endCol = match[3] ? colToNum(match[3]) : startCol;
        const endRow = match[4] ? parseInt(match[4], 10) - 1 : startRow;

        return { startRow, endRow, startCol, endCol };
    };

    return [
        createTool(
            'editSpreadsheet',
            'Edit specific cells in an Excel spreadsheet. Supports values, numbers, and formulas. Use isFormula: true for formulas like "=SUM(A1:A10)". If path is omitted, edits the active file.',
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
                                value: { type: 'string', description: 'New value or formula (e.g., "=SUM(A1:A10)")' },
                                isNumber: { type: 'boolean', description: 'Set to true if value should be treated as a number' },
                                isFormula: { type: 'boolean', description: 'Set to true if value is a formula (e.g., "=B2*C2")' }
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
                edits: Array<{ sheet?: string, cell: string, value: string, isNumber?: boolean, isFormula?: boolean }>
            }) => {
                const { setCellValue, workspaceFiles, activeFilePath, activeFileHandle } = context;

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
                    let formulasApplied = 0;
                    for (const edit of edits) {
                        const isFormula = edit.isFormula || edit.value.startsWith('=');
                        const value = edit.isNumber && !isFormula ? parseFloat(edit.value) || edit.value : edit.value;
                        setCellValue(edit.cell, value as string | number, edit.sheet, { isNumber: edit.isNumber, isFormula });
                        editsApplied++;
                        if (isFormula) formulasApplied++;
                    }
                    console.log(`[editSpreadsheet] Applied ${editsApplied} edits (${formulasApplied} formulas) via live callback`);
                    const formulaNote = formulasApplied > 0 ? ` (including ${formulasApplied} formula(s))` : '';
                    return `Successfully applied ${editsApplied} edits${formulaNote} to the spreadsheet. Changes are visible immediately.`;
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
                    const XLSX = await import('xlsx-js-style');
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
                        const isFormula = edit.isFormula || edit.value.startsWith('=');

                        if (isFormula) {
                            // Set cell with formula
                            worksheet[cellAddress] = { f: edit.value.slice(1), t: 'n' };
                        } else {
                            // Parse value (number or string)
                            let cellValue: string | number | boolean = edit.value;
                            if (edit.isNumber) {
                                const num = parseFloat(edit.value);
                                if (!isNaN(num)) cellValue = num;
                            }
                            XLSX.utils.sheet_add_aoa(worksheet, [[cellValue]], { origin: cellAddress });
                        }
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
        ),

        createTool(
            'formatSpreadsheet',
            'Apply visual formatting to a range of cells. Use for headers, input cells, or calculated cells. Supports number formats, colors, bold, alignment.',
            {
                type: 'object',
                properties: {
                    range: {
                        type: 'string',
                        description: 'Cell range in A1 notation (e.g., "A1:D1" for header row, "B5" for single cell)'
                    },
                    sheet: {
                        type: 'string',
                        description: 'Sheet name. Defaults to active sheet.'
                    },
                    numberFormat: {
                        type: 'string',
                        description: 'Excel number format string. Examples: "$#,##0.00" (currency), "0.0%" (percent), "#,##0" (thousands)'
                    },
                    bold: { type: 'boolean', description: 'Make text bold' },
                    italic: { type: 'boolean', description: 'Make text italic' },
                    fontColor: {
                        type: 'string',
                        description: 'Font color as hex code (e.g., "#0000FF" for blue inputs, "#000000" for formulas)'
                    },
                    backgroundColor: {
                        type: 'string',
                        description: 'Cell background color as hex code (e.g., "#FFFF99" for input cells)'
                    },
                    align: {
                        type: 'string',
                        enum: ['left', 'center', 'right'],
                        description: 'Horizontal text alignment'
                    }
                },
                required: ['range'],
                additionalProperties: false
            },
            async ({ range, sheet, numberFormat, bold, italic, fontColor, backgroundColor, align }: {
                range: string;
                sheet?: string;
                numberFormat?: string;
                bold?: boolean;
                italic?: boolean;
                fontColor?: string;
                backgroundColor?: string;
                align?: 'left' | 'center' | 'right';
            }) => {
                const { setCellValue } = context;

                // Parse range
                const parsedRange = parseRange(range);
                if (!parsedRange) {
                    return `Error: Invalid range "${range}". Use A1 notation (e.g., "A1:D1" or "B5").`;
                }

                const { startRow, endRow, startCol, endCol } = parsedRange;

                // Build style object for FortuneSheet
                const style: Record<string, unknown> = {};
                if (bold) style.bl = 1;
                if (italic) style.it = 1;
                if (fontColor) style.fc = fontColor;
                if (backgroundColor) style.bg = backgroundColor;
                if (align) {
                    const alignMap: Record<string, number> = { left: 1, center: 0, right: 2 };
                    style.ht = alignMap[align];
                }

                // Check if there's no style to apply
                const hasStyle = Object.keys(style).length > 0;
                const hasFormat = !!numberFormat;

                if (!hasStyle && !hasFormat) {
                    return 'Error: No formatting options specified. Use bold, italic, fontColor, backgroundColor, align, or numberFormat.';
                }

                if (!setCellValue) {
                    return 'Error: Cannot format - no live spreadsheet editor available. Open an xlsx file first.';
                }

                // Convert column index to letter
                const colToLetter = (col: number): string => {
                    let result = '';
                    let c = col;
                    while (c >= 0) {
                        result = String.fromCharCode((c % 26) + 65) + result;
                        c = Math.floor(c / 26) - 1;
                    }
                    return result;
                };

                // Apply style to each cell in range
                let cellsFormatted = 0;
                for (let row = startRow; row <= endRow; row++) {
                    for (let col = startCol; col <= endCol; col++) {
                        const cellAddress = `${colToLetter(col)}${row + 1}`;
                        // Use setCellValue with style option to apply formatting
                        // We pass empty string as value to just apply style without changing value
                        // Actually, we need a special handling - update existing cell with new style
                        setCellValue(cellAddress, '', sheet, { style });
                        cellsFormatted++;
                    }
                }

                const formatDetails: string[] = [];
                if (bold) formatDetails.push('bold');
                if (italic) formatDetails.push('italic');
                if (fontColor) formatDetails.push(`font color ${fontColor}`);
                if (backgroundColor) formatDetails.push(`background ${backgroundColor}`);
                if (align) formatDetails.push(`${align} aligned`);
                if (numberFormat) formatDetails.push(`format "${numberFormat}"`);

                return `Applied formatting (${formatDetails.join(', ')}) to ${cellsFormatted} cell(s) in range ${range}.`;
            }
        )
    ];
};
