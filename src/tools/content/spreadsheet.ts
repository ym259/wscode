import { ToolDefinition, createTool, ToolContext } from '../types';
import { findFileHandle } from '../utils';

export const getSpreadsheetEditTools = (context: ToolContext): ToolDefinition[] => {
    return [
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
