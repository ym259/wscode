/**
 * Spreadsheet-specific AI tools
 * @module tools/spreadsheet
 */

import { ToolDefinition, createTool, ToolContext } from './types';
import { findFileHandle } from './utils';

/**
 * Get spreadsheet-specific tools for reading and modifying xlsx files
 */
export const getSpreadsheetTools = (context: ToolContext): ToolDefinition[] => {
    const { workspaceFiles, activeFilePath, activeFileHandle, setCellValue, addFileToWorkspace } = context;

    return [
        createTool(
            'listSpreadsheetSheets',
            'List all sheets in an Excel file with their dimensions (row and column counts). Call this first before reading large xlsx files to understand the structure and avoid loading unnecessary data.',
            {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'Path to the xlsx file. Defaults to active file if currently viewing an xlsx.'
                    }
                },
                required: [],
                additionalProperties: false
            },
            async ({ path }: { path?: string }) => {
                const targetPath = path || activeFilePath;

                if (!targetPath) {
                    return 'Error: No path provided and no active file found. Please specify the xlsx file path.';
                }

                if (!targetPath.endsWith('.xlsx') && !targetPath.endsWith('.xls')) {
                    return `Error: File "${targetPath}" is not an Excel file (.xlsx or .xls).`;
                }

                // Find file handle
                let handle: FileSystemFileHandle | null = null;

                if (activeFileHandle && (targetPath === activeFilePath || !path)) {
                    handle = activeFileHandle;
                } else if (workspaceFiles) {
                    handle = findFileHandle(workspaceFiles, targetPath);
                }

                if (!handle) {
                    return `Error: File not found: ${targetPath}. Check the path matches the workspace.`;
                }

                try {
                    const XLSX = await import('xlsx-js-style');
                    const file = await handle.getFile();
                    const arrayBuffer = await file.arrayBuffer();
                    const workbook = XLSX.read(arrayBuffer, { type: 'array' });

                    const sheets = workbook.SheetNames.map((sheetName, index) => {
                        const worksheet = workbook.Sheets[sheetName];
                        const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
                        const rowCount = range.e.r - range.s.r + 1;
                        const colCount = range.e.c - range.s.c + 1;

                        return {
                            index,
                            name: sheetName,
                            rows: rowCount,
                            cols: colCount
                        };
                    });

                    let result = `Excel file "${targetPath}" contains ${sheets.length} sheet(s):\n\n`;
                    sheets.forEach(sheet => {
                        result += `[${sheet.index}] "${sheet.name}" - ${sheet.rows} rows × ${sheet.cols} columns\n`;
                    });

                    result += `\nTip: Use readFile({ path: "${targetPath}", sheets: ["SheetName"] }) to read specific sheet(s).`;

                    return result;
                } catch (error) {
                    console.error('[listSpreadsheetSheets] Error:', error);
                    return `Error reading spreadsheet: ${error instanceof Error ? error.message : 'Unknown error'}`;
                }
            }
        ),

        createTool(
            'insertRow',
            'Insert a new row with data into an Excel spreadsheet. The row will be appended at the end of the data range or at a specific position.',
            {
                type: 'object',
                properties: {
                    sheet: {
                        type: 'string',
                        description: 'Sheet name. Defaults to first sheet.'
                    },
                    rowIndex: {
                        type: 'integer',
                        description: 'Row index (1-indexed) to insert at. If omitted, appends to the end.'
                    },
                    data: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Array of cell values for the new row, in column order (A, B, C...).'
                    }
                },
                required: ['data'],
                additionalProperties: false
            },
            async ({ sheet, rowIndex, data }: { sheet?: string; rowIndex?: number; data: string[] }) => {
                if (!data || !Array.isArray(data) || data.length === 0) {
                    return 'Error: data array is required and must contain at least one value.';
                }

                if (!setCellValue) {
                    return 'Error: Cannot insert row - no live spreadsheet editor available. Open an xlsx file first.';
                }

                // Convert column index to letter (0 -> A, 1 -> B, etc.)
                const colToLetter = (col: number): string => {
                    let result = '';
                    let c = col;
                    while (c >= 0) {
                        result = String.fromCharCode((c % 26) + 65) + result;
                        c = Math.floor(c / 26) - 1;
                    }
                    return result;
                };

                // Default to row 1 if not specified (will need to find actual end)
                const targetRow = rowIndex || 1;

                // Insert each value
                for (let i = 0; i < data.length; i++) {
                    const cellAddress = `${colToLetter(i)}${targetRow}`;
                    const value = data[i];
                    const isNumber = !isNaN(Number(value)) && value.trim() !== '';
                    setCellValue(cellAddress, isNumber ? Number(value) : value, sheet, isNumber);
                }

                return `Inserted row at position ${targetRow} with ${data.length} values.`;
            }
        ),

        createTool(
            'deleteRow',
            'Clear all data from a specific row in the spreadsheet. Note: This clears cells but does not shift rows up.',
            {
                type: 'object',
                properties: {
                    sheet: {
                        type: 'string',
                        description: 'Sheet name. Defaults to first sheet.'
                    },
                    rowIndex: {
                        type: 'integer',
                        description: 'Row index (1-indexed) to delete/clear.'
                    },
                    columnCount: {
                        type: 'integer',
                        description: 'Number of columns to clear. Defaults to 26 (A-Z).'
                    }
                },
                required: ['rowIndex'],
                additionalProperties: false
            },
            async ({ sheet, rowIndex, columnCount }: { sheet?: string; rowIndex: number; columnCount?: number }) => {
                if (!rowIndex || rowIndex < 1) {
                    return 'Error: rowIndex is required and must be >= 1.';
                }

                if (!setCellValue) {
                    return 'Error: Cannot delete row - no live spreadsheet editor available. Open an xlsx file first.';
                }

                const cols = columnCount || 26;

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

                // Clear each cell in the row
                for (let i = 0; i < cols; i++) {
                    const cellAddress = `${colToLetter(i)}${rowIndex}`;
                    setCellValue(cellAddress, '', sheet);
                }

                return `Cleared row ${rowIndex} (${cols} columns).`;
            }
        ),

        createTool(
            'readSpreadsheetRange',
            'Read a specific range of cells with detailed information including formulas and styles. Use to debug or understand existing spreadsheet logic.',
            {
                type: 'object',
                properties: {
                    range: {
                        type: 'string',
                        description: 'Cell range in A1 notation (e.g., "A1:C10")'
                    },
                    sheet: {
                        type: 'string',
                        description: 'Sheet name. Defaults to first sheet.'
                    },
                    includeFormulas: {
                        type: 'boolean',
                        description: 'If true, returns formula strings (e.g., "=SUM(A1:A5)") instead of computed values'
                    },
                    includeStyles: {
                        type: 'boolean',
                        description: 'If true, includes formatting info (bold, colors, number format)'
                    }
                },
                required: ['range'],
                additionalProperties: false
            },
            async ({ range, sheet, includeFormulas, includeStyles }: {
                range: string;
                sheet?: string;
                includeFormulas?: boolean;
                includeStyles?: boolean;
            }) => {
                // Parse range (e.g., "A1:C10" or "B5")
                const rangeMatch = range.match(/^([A-Za-z]+)(\d+)(?::([A-Za-z]+)(\d+))?$/);
                if (!rangeMatch) {
                    return `Error: Invalid range "${range}". Use A1 notation (e.g., "A1:C10" or "B5").`;
                }

                const colToNum = (col: string): number => {
                    let num = 0;
                    const c = col.toUpperCase();
                    for (let i = 0; i < c.length; i++) {
                        num = num * 26 + (c.charCodeAt(i) - 64);
                    }
                    return num - 1;
                };

                const startCol = colToNum(rangeMatch[1]);
                const startRow = parseInt(rangeMatch[2], 10) - 1;
                const endCol = rangeMatch[3] ? colToNum(rangeMatch[3]) : startCol;
                const endRow = rangeMatch[4] ? parseInt(rangeMatch[4], 10) - 1 : startRow;

                // Find file handle
                let handle: FileSystemFileHandle | null = null;
                if (activeFileHandle) {
                    handle = activeFileHandle;
                } else if (workspaceFiles && activeFilePath) {
                    handle = findFileHandle(workspaceFiles, activeFilePath);
                }

                if (!handle) {
                    return 'Error: No spreadsheet file is currently open.';
                }

                try {
                    const XLSX = await import('xlsx-js-style');
                    const file = await handle.getFile();
                    const arrayBuffer = await file.arrayBuffer();
                    const workbook = XLSX.read(arrayBuffer, { type: 'array', cellStyles: true });

                    const sheetName = sheet || workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    if (!worksheet) {
                        return `Error: Sheet "${sheetName}" not found. Available: ${workbook.SheetNames.join(', ')}`;
                    }

                    const colToLetter = (col: number): string => {
                        let result = '';
                        let c = col;
                        while (c >= 0) {
                            result = String.fromCharCode((c % 26) + 65) + result;
                            c = Math.floor(c / 26) - 1;
                        }
                        return result;
                    };

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const cells: Array<{ address: string; value: any; formula?: string; format?: string; style?: Record<string, unknown> }> = [];

                    for (let row = startRow; row <= endRow; row++) {
                        for (let col = startCol; col <= endCol; col++) {
                            const addr = `${colToLetter(col)}${row + 1}`;
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const cell = worksheet[addr] as any;

                            if (cell) {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const cellInfo: any = { address: addr, value: cell.v };

                                if (includeFormulas && cell.f) {
                                    cellInfo.formula = `=${cell.f}`;
                                }

                                if (cell.z) {
                                    cellInfo.format = cell.z;
                                }

                                if (includeStyles && cell.s) {
                                    const style: Record<string, unknown> = {};
                                    if (cell.s.font?.bold) style.bold = true;
                                    if (cell.s.font?.italic) style.italic = true;
                                    if (cell.s.font?.color?.rgb) style.fontColor = `#${cell.s.font.color.rgb}`;
                                    if (cell.s.fill?.fgColor?.rgb) style.backgroundColor = `#${cell.s.fill.fgColor.rgb}`;
                                    if (Object.keys(style).length > 0) {
                                        cellInfo.style = style;
                                    }
                                }

                                cells.push(cellInfo);
                            }
                        }
                    }

                    if (cells.length === 0) {
                        return `Range ${range} is empty.`;
                    }

                    // Format output
                    let result = `Range ${range} in "${sheetName}":\n\n`;
                    cells.forEach(cell => {
                        let line = `${cell.address}: ${JSON.stringify(cell.value)}`;
                        if (cell.formula) line += ` [formula: ${cell.formula}]`;
                        if (cell.format) line += ` [format: ${cell.format}]`;
                        if (cell.style) line += ` [style: ${JSON.stringify(cell.style)}]`;
                        result += line + '\n';
                    });

                    return result;
                } catch (error) {
                    console.error('[readSpreadsheetRange] Error:', error);
                    return `Error reading range: ${error instanceof Error ? error.message : 'Unknown error'}`;
                }
            }
        ),

        createTool(
            'createSpreadsheet',
            'Create a new Excel spreadsheet file with the specified data. Use this tool when the user wants to export data to a new xlsx file. The file will be saved to the user\'s chosen location.',
            {
                type: 'object',
                properties: {
                    filename: {
                        type: 'string',
                        description: 'Suggested filename for the new spreadsheet (e.g., "report.xlsx"). The .xlsx extension will be added if not present.'
                    },
                    sheets: {
                        type: 'array',
                        description: 'Array of sheets to create. Each sheet has a name and data.',
                        items: {
                            type: 'object',
                            properties: {
                                name: {
                                    type: 'string',
                                    description: 'Sheet name (e.g., "Summary", "Data")'
                                },
                                headers: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: 'Column headers for the first row'
                                },
                                rows: {
                                    type: 'array',
                                    description: 'Data rows. Each row is an array of cell values.',
                                    items: {
                                        type: 'array',
                                        items: {
                                            oneOf: [
                                                { type: 'string' },
                                                { type: 'number' },
                                                { type: 'boolean' },
                                                { type: 'null' }
                                            ]
                                        }
                                    }
                                },
                                columnWidths: {
                                    type: 'array',
                                    items: { type: 'number' },
                                    description: 'Optional column widths in characters'
                                }
                            },
                            required: ['name', 'rows']
                        }
                    }
                },
                required: ['filename', 'sheets'],
                additionalProperties: false
            },
            async ({ filename, sheets }: {
                filename: string;
                sheets: Array<{
                    name: string;
                    headers?: string[];
                    rows: Array<Array<string | number | boolean | null>>;
                    columnWidths?: number[];
                }>;
            }) => {
                if (!filename) {
                    return 'Error: filename is required.';
                }

                if (!sheets || !Array.isArray(sheets) || sheets.length === 0) {
                    return 'Error: At least one sheet with data is required.';
                }

                try {
                    const XLSX = await import('xlsx-js-style');
                    const workbook = XLSX.utils.book_new();

                    for (const sheet of sheets) {
                        // Build data array: headers (if provided) + rows
                        const data: Array<Array<string | number | boolean | null>> = [];
                        
                        if (sheet.headers && sheet.headers.length > 0) {
                            data.push(sheet.headers);
                        }
                        
                        data.push(...sheet.rows);

                        // Create worksheet from data
                        const worksheet = XLSX.utils.aoa_to_sheet(data);

                        // Apply header styling if headers exist
                        if (sheet.headers && sheet.headers.length > 0) {
                            for (let col = 0; col < sheet.headers.length; col++) {
                                const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
                                if (worksheet[cellAddress]) {
                                    worksheet[cellAddress].s = {
                                        font: { bold: true },
                                        fill: { fgColor: { rgb: 'E2E8F0' } },
                                        alignment: { horizontal: 'center' }
                                    };
                                }
                            }
                        }

                        // Set column widths if provided
                        if (sheet.columnWidths && sheet.columnWidths.length > 0) {
                            worksheet['!cols'] = sheet.columnWidths.map(w => ({ wch: w }));
                        } else {
                            // Auto-calculate column widths based on content
                            const colWidths: number[] = [];
                            for (let row = 0; row < data.length; row++) {
                                for (let col = 0; col < data[row].length; col++) {
                                    const cellValue = String(data[row][col] ?? '');
                                    const width = Math.min(Math.max(cellValue.length + 2, 10), 50);
                                    colWidths[col] = Math.max(colWidths[col] || 0, width);
                                }
                            }
                            if (colWidths.length > 0) {
                                worksheet['!cols'] = colWidths.map(w => ({ wch: w }));
                            }
                        }

                        // Add sheet to workbook
                        XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
                    }

                    // Generate workbook buffer
                    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
                    const blob = new Blob([buffer], { 
                        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
                    });

                    // Ensure filename has .xlsx extension
                    const finalFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;

                    // Try to use File System Access API if available
                    if ('showSaveFilePicker' in window) {
                        try {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const handle = await (window as any).showSaveFilePicker({
                                suggestedName: finalFilename,
                                types: [{
                                    description: 'Excel Spreadsheet',
                                    accept: {
                                        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']
                                    }
                                }]
                            });

                            const writable = await handle.createWritable();
                            await writable.write(blob);
                            await writable.close();

                            // Add to workspace if callback is available
                            if (addFileToWorkspace) {
                                addFileToWorkspace(handle);
                            }

                            const totalRows = sheets.reduce((sum, s) => sum + s.rows.length + (s.headers ? 1 : 0), 0);
                            return `Successfully created spreadsheet "${handle.name}" with ${sheets.length} sheet(s) and ${totalRows} total rows. The file has been saved and added to your workspace.`;
                        } catch (err) {
                            // User cancelled the save dialog
                            if ((err as Error).name === 'AbortError') {
                                return 'File save was cancelled by the user.';
                            }
                            throw err;
                        }
                    } else {
                        // Fallback: trigger download
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = finalFilename;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        URL.revokeObjectURL(url);

                        const totalRows = sheets.reduce((sum, s) => sum + s.rows.length + (s.headers ? 1 : 0), 0);
                        return `Successfully created and downloaded spreadsheet "${finalFilename}" with ${sheets.length} sheet(s) and ${totalRows} total rows. To work with this file, add it to your workspace using the file explorer.`;
                    }
                } catch (error) {
                    console.error('[createSpreadsheet] Error:', error);
                    return `Error creating spreadsheet: ${error instanceof Error ? error.message : 'Unknown error'}`;
                }
            }
        )
    ];
};
