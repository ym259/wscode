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
    const { workspaceFiles, activeFilePath, activeFileHandle, setCellValue } = context;

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
                    const XLSX = await import('xlsx');
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
        )
    ];
};
