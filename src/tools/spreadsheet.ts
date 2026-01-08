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
    const { workspaceFiles, activeFilePath, activeFileHandle, setCellValue, addFileToWorkspace, addLoadedImageFile } = context;

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

                        // Original range from !ref
                        const ref = worksheet['!ref'];

                        // Calculate trimmed range (actual data)
                        let minR = Infinity, maxR = -Infinity;
                        let minC = Infinity, maxC = -Infinity;
                        let hasData = false;

                        // Iterate all keys to find data bounds
                        Object.keys(worksheet).forEach(key => {
                            if (key.startsWith('!')) return; // Skip metadata

                            const cellCoords = XLSX.utils.decode_cell(key);
                            if (worksheet[key].v !== undefined && worksheet[key].v !== null && String(worksheet[key].v).trim() !== '') {
                                minR = Math.min(minR, cellCoords.r);
                                maxR = Math.max(maxR, cellCoords.r);
                                minC = Math.min(minC, cellCoords.c);
                                maxC = Math.max(maxC, cellCoords.c);
                                hasData = true;
                            }
                        });

                        const trimmedRows = hasData ? maxR - minR + 1 : 0;
                        const trimmedCols = hasData ? maxC - minC + 1 : 0;

                        // Convert column index to letter
                        const colToLetter = (c: number) => XLSX.utils.encode_col(c);
                        const trimmedRangeStr = hasData
                            ? `${colToLetter(minC)}${minR + 1}:${colToLetter(maxC)}${maxR + 1}`
                            : 'Empty';

                        return {
                            index,
                            name: sheetName,
                            originalRange: ref || 'Empty',
                            trimmedRange: trimmedRangeStr,
                            rows: trimmedRows,
                            cols: trimmedCols,
                            isEmpty: !hasData
                        };
                    });

                    // Return as JSON string for the agent to parse programmatically
                    return JSON.stringify({
                        file: targetPath,
                        sheetCount: sheets.length,
                        sheets
                    }, null, 2);
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
        ),
        createTool(
            'visualizeSpreadsheet',
            'Capture a visual snapshot of the spreadsheet. Use this FIRST to see the layout and identify row/column structures. Visualizes the entire used range of the sheet.',
            {
                type: 'object',
                properties: {
                    sheet: {
                        type: 'string',
                        description: 'Sheet name. Defaults to first sheet.'
                    }
                },
                required: [],
                additionalProperties: false
            },
            async ({ sheet }: { sheet?: string }) => {
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
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    let workbook: any;

                    // Try to get live workbook from editor context first
                    if (context.getWorkbook) {
                        try {
                            workbook = context.getWorkbook();
                            if (workbook) {
                                console.log('[visualizeSpreadsheet] Using live workbook data from editor');
                            }
                        } catch (e) {
                            console.error('[visualizeSpreadsheet] Failed to get live workbook:', e);
                        }
                    }

                    // Fallback to reading file from disk if no live workbook
                    if (!workbook) {
                        console.log('[visualizeSpreadsheet] Reading file from disk');
                        const file = await handle.getFile();
                        const arrayBuffer = await file.arrayBuffer();
                        workbook = XLSX.read(arrayBuffer, { type: 'array' });
                    }

                    const sheetName = sheet || workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    if (!worksheet) {
                        return `Error: Sheet "${sheetName}" not found. Available: ${workbook.SheetNames.join(', ')}`;
                    }

                    // Use XLSX utils for column conversion
                    const colToLetter = XLSX.utils.encode_col;


                    // Determine Range
                    let startCol = 0, startRow = 0, endCol = 0, endRow = 0;


                    // Auto-detect range based on data
                    let minR = Infinity, maxR = -Infinity;
                    let minC = Infinity, maxC = -Infinity;

                    let hasData = false;

                    Object.keys(worksheet).forEach(key => {
                        if (key.startsWith('!')) return;
                        const cell = XLSX.utils.decode_cell(key);
                        if (worksheet[key].v !== undefined && worksheet[key].v !== null && String(worksheet[key].v).trim() !== '') {
                            minR = Math.min(minR, cell.r);
                            maxR = Math.max(maxR, cell.r);
                            minC = Math.min(minC, cell.c);
                            maxC = Math.max(maxC, cell.c);
                            hasData = true;
                        }
                    });


                    if (hasData) {
                        startCol = minC;
                        startRow = minR;
                        endCol = maxC;
                        endRow = maxR;

                    } else {
                        // Empty sheet or failed detection
                        startCol = 0; startRow = 0; endCol = 5; endRow = 5; // Default small area

                    }

                    // Build data for image generation
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const rows: any[][] = [];
                    for (let row = startRow; row <= endRow; row++) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const rowData: any[] = [];
                        for (let col = startCol; col <= endCol; col++) {
                            const addr = `${colToLetter(col)}${row + 1}`;
                            let cellAddress = addr;

                            // Check for merged cells to potentially blank out non-master cells for visual clarity
                            // although html-to-image is robust enough, simpler grid often looks better for AI understanding
                            if (worksheet['!merges']) {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const merge = worksheet['!merges'].find((m: any) =>
                                    row >= m.s.r && row <= m.e.r && col >= m.s.c && col <= m.e.c
                                );
                                if (merge) {
                                    if (row === merge.s.r && col === merge.s.c) {
                                        cellAddress = `${colToLetter(merge.s.c)}${merge.s.r + 1}`;
                                    } else {
                                        cellAddress = ''; // Signal to look nowhere
                                    }
                                }
                            }

                            let value = '';
                            if (cellAddress) {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const cell = worksheet[cellAddress] as any;
                                value = cell ? (cell.w || cell.v) : '';
                                if (value === undefined || value === null) value = '';
                            }
                            rowData.push(value);
                        }
                        rows.push(rowData);
                    }

                    // Generate Image using Canvas
                    // Settings matching standard XlsxEditor look
                    const rowHeaderWidth = 80;
                    const colHeaderHeight = 32;
                    const defaultColWidth = 73;
                    const defaultRowHeight = 20;
                    const headerBg = '#f4f5f8';
                    const borderColor = '#d4d4d4';

                    // Prepare Dimensions
                    const colWidths: number[] = [];
                    const rowHeights: number[] = [];

                    // Parse Column Widths
                    // SheetJS allows !cols with {wpx} or {wch}. wpx is pixels. wch is chars.
                    const colInfo = worksheet['!cols'] || [];
                    for (let c = startCol; c <= endCol; c++) {
                        const colDef = colInfo[c];
                        let w = defaultColWidth;
                        if (colDef) {
                            if (colDef.wpx) w = colDef.wpx;
                            else if (colDef.wch) w = colDef.wch * 7.5; // Approx chars to pixels
                        }
                        colWidths.push(w);
                    }

                    // Parse Row Heights
                    const rowInfo = worksheet['!rows'] || [];
                    for (let r = startRow; r <= endRow; r++) {
                        const rowDef = rowInfo[r];
                        let h = defaultRowHeight;
                        if (rowDef && rowDef.hpx) h = rowDef.hpx;
                        rowHeights.push(h);
                    }

                    // Calculate Total Size
                    const totalWidth = rowHeaderWidth + colWidths.reduce((a, b) => a + b, 0);
                    const totalHeight = colHeaderHeight + rowHeights.reduce((a, b) => a + b, 0);

                    // Positions Cache
                    const colPositions: number[] = [rowHeaderWidth];
                    let currentX = rowHeaderWidth;
                    for (const w of colWidths) {
                        currentX += w;
                        colPositions.push(currentX); // End of this Col / Start of Next
                    }
                    // colPositions[i] is Left of column i (relative to grid start) ? No. 
                    // Let's make colPositions[i] be the X coordinate of the START of column i (relative to canvas 0)
                    // So colPositions[0] = rowHeaderWidth.
                    // Correct loop:
                    const xPos: number[] = [];
                    let cx = rowHeaderWidth;
                    for (let i = 0; i < colWidths.length; i++) {
                        xPos.push(cx);
                        cx += colWidths[i];
                    }

                    const yPos: number[] = [];
                    let cy = colHeaderHeight;
                    for (let i = 0; i < rowHeights.length; i++) {
                        yPos.push(cy);
                        cy += rowHeights[i];
                    }

                    // Create Canvas
                    const canvas = document.createElement('canvas');

                    // Safety: Reduce DPR for large sheets to prevent massive Base64 strings
                    let dpr = 2;
                    if (totalWidth > 2000 || totalHeight > 2000) {
                        dpr = 1;
                    }
                    if (totalWidth > 4000 || totalHeight > 4000) {
                        dpr = 1;
                    }

                    canvas.width = totalWidth * dpr;
                    canvas.height = totalHeight * dpr;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) return 'Error: Could not get canvas context.';

                    ctx.scale(dpr, dpr);
                    ctx.fillStyle = 'white';
                    ctx.fillRect(0, 0, totalWidth, totalHeight);
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.lineWidth = 1;

                    // --- DRAWING ---

                    // 1. Grid Backgrounds & Borders (Headers & Cells)

                    // Column Header Backgrounds
                    for (let i = 0; i < colWidths.length; i++) {
                        const x = xPos[i];
                        const w = colWidths[i];
                        ctx.fillStyle = headerBg;
                        ctx.fillRect(x, 0, w, colHeaderHeight);
                        ctx.strokeStyle = borderColor;
                        ctx.strokeRect(x - 0.5, 0 - 0.5, w + 1, colHeaderHeight + 1);
                    }

                    // Row Header Backgrounds
                    for (let i = 0; i < rowHeights.length; i++) {
                        const y = yPos[i];
                        const h = rowHeights[i];
                        ctx.fillStyle = headerBg;
                        ctx.fillRect(0, y, rowHeaderWidth, h);
                        ctx.strokeStyle = borderColor;
                        ctx.strokeRect(0, y, rowHeaderWidth, h);

                        // Grid lines for cells in this row
                        for (let j = 0; j < colWidths.length; j++) {
                            const x = xPos[j];
                            const w = colWidths[j];
                            ctx.strokeStyle = borderColor;
                            ctx.strokeRect(x, y, w, h);
                        }
                    }

                    // 2. Cell Content
                    ctx.fillStyle = '#000';
                    ctx.font = '11px Arial';
                    ctx.textAlign = 'left';

                    for (let r = 0; r < rows.length; r++) {
                        const y = yPos[r];
                        const h = rowHeights[r];
                        const rowData = rows[r];

                        for (let c = 0; c < rowData.length; c++) {
                            const val = rowData[c];
                            if (!val) continue;

                            const x = xPos[c];
                            const w = colWidths[c];

                            // Clip
                            ctx.save();
                            ctx.beginPath();
                            ctx.rect(x, y, w, h);
                            ctx.clip();

                            // Draw Text
                            ctx.fillText(String(val), x + 2, y + h / 2);
                            ctx.restore();
                        }
                    }

                    // 3. Header Text (Z-Layering for overflow)
                    ctx.fillStyle = '#666';
                    ctx.font = 'bold 16px sans-serif';
                    ctx.textAlign = 'center';

                    // Column Labels
                    for (let i = 0; i < colWidths.length; i++) {
                        const colIdx = startCol + i;
                        // Sparse Indexing: Every 5th
                        if (colIdx % 5 === 0) {
                            const x = xPos[i];
                            const w = colWidths[i];
                            const label = colToLetter(colIdx);
                            ctx.fillText(label, x + w / 2, colHeaderHeight / 2);
                        }
                    }

                    // Row Labels
                    for (let i = 0; i < rowHeights.length; i++) {
                        const rowIdx = startRow + i;
                        // Sparse Indexing: Every 5th
                        if (rowIdx % 5 === 0) {
                            const y = yPos[i];
                            const h = rowHeights[i];
                            ctx.fillText(String(rowIdx + 1), rowHeaderWidth / 2, y + h / 2);
                        }
                    }

                    // Generate Data URL and return as Markdown Image
                    const dataUrl = canvas.toDataURL('image/png');

                    // Try to upload first to avoid massive Base64 strings in context (Token limits)
                    if (addLoadedImageFile) {
                        try {
                            const params = { imageBase64: dataUrl, filename: `${sheetName}_FULL_${Date.now()}.png` };
                            const response = await fetch('/api/image/upload', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(params)
                            });
                            if (response.ok) {
                                const { file_id } = await response.json();
                                // Inject image into agent context
                                addLoadedImageFile({ file_id, filename: params.filename });
                                return `[Image generated. File ID: ${file_id}]`;
                            }
                        } catch (e) {
                            console.error('Image upload failed, falling back to Base64:', e);
                        }
                    }

                    // We explicitly want to allow the user to see the image in the chat/tool output
                    // so we return the markdown image string. 
                    return `![Spreadsheet](${dataUrl})`;

                } catch (error) {
                    console.error('[visualizeSpreadsheet] Error:', error);
                    return `Error: ${error instanceof Error ? error.message : String(error)}`;
                }
            }
        ),
        createTool(
            'readSpreadsheet',
            'Read a range of cells or specific cells. Output formats: "json" (detailed structure & merges), "csv" (data), "markdown" (chat-friendly). Use this to read specific data attributes or check values.',
            {
                type: 'object',
                properties: {
                    range: {
                        type: 'string',
                        description: 'Cell range in A1 notation (e.g., "A1:E10"). Optional. If omitted, defaults to the entire used range of the sheet.'
                    },
                    cells: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'List of specific cells to read (e.g., ["A1", "C5"]). Optional. If provided, range is ignored.'
                    },
                    sheet: {
                        type: 'string',
                        description: 'Sheet name. Defaults to first sheet.'
                    },
                    format: {
                        type: 'string',
                        enum: ['markdown', 'csv', 'ascii', 'json'],
                        description: 'Output format. Defaults to "markdown". Use "json" for detailed structure/merges/styles.'
                    }
                },
                required: [],
                additionalProperties: false
            },
            async ({ range, cells, sheet, format = 'markdown' }: { range?: string; cells?: string[]; sheet?: string; format?: 'markdown' | 'csv' | 'ascii' | 'json' }) => {
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
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    let workbook: any;

                    // Try to get live workbook from editor context first
                    if (context.getWorkbook) {
                        try {
                            workbook = context.getWorkbook();
                        } catch (e) {
                            console.error('[readSpreadsheet] Failed to get live workbook:', e);
                        }
                    }

                    // Fallback to reading file from disk if no live workbook
                    if (!workbook) {
                        const file = await handle.getFile();
                        const arrayBuffer = await file.arrayBuffer();
                        workbook = XLSX.read(arrayBuffer, { type: 'array' });
                    }

                    const sheetName = sheet || workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    if (!worksheet) {
                        return `Error: Sheet "${sheetName}" not found. Available: ${workbook.SheetNames.join(', ')}`;
                    }

                    // Use XLSX utils for column conversion
                    const colToLetter = XLSX.utils.encode_col;
                    const letterToCol = XLSX.utils.decode_col;


                    // Determine Range
                    let startCol = 0, startRow = 0, endCol = 0, endRow = 0;
                    let rangeStr = '';

                    if (range) {
                        const rangeMatch = range.match(/^([A-Za-z]+)(\d+)(?::([A-Za-z]+)(\d+))?$/);
                        if (!rangeMatch) {
                            return `Error: Invalid range "${range}". Use A1 notation (e.g., "A1:C10" or "B5").`;
                        }
                        startCol = letterToCol(rangeMatch[1]);
                        startRow = parseInt(rangeMatch[2], 10) - 1;
                        endCol = rangeMatch[3] ? letterToCol(rangeMatch[3]) : startCol;
                        endRow = rangeMatch[4] ? parseInt(rangeMatch[4], 10) - 1 : startRow;
                        rangeStr = range;
                    } else {
                        // Auto-detect range based on data
                        let minR = Infinity, maxR = -Infinity;
                        let minC = Infinity, maxC = -Infinity;
                        let hasData = false;

                        Object.keys(worksheet).forEach(key => {
                            if (key.startsWith('!')) return;
                            const cell = XLSX.utils.decode_cell(key);
                            if (worksheet[key].v !== undefined && worksheet[key].v !== null && String(worksheet[key].v).trim() !== '') {
                                minR = Math.min(minR, cell.r);
                                maxR = Math.max(maxR, cell.r);
                                minC = Math.min(minC, cell.c);
                                maxC = Math.max(maxC, cell.c);
                                hasData = true;
                            }
                        });


                        if (hasData) {
                            startCol = minC;
                            startRow = minR;
                            endCol = maxC;
                            endRow = maxR;
                            rangeStr = `${colToLetter(startCol)}${startRow + 1}:${colToLetter(endCol)}${endRow + 1}`;
                        } else {
                            // Empty sheet or failed detection
                            startCol = 0; startRow = 0; endCol = 5; endRow = 5; // Default small area
                            rangeStr = "A1:F6";
                        }
                    }

                    // --- JSON MODE ---
                    if (format === 'json') {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const result: any = {
                            sheet: sheetName,
                            range: rangeStr,
                            mergedCells: [],
                            cells: {}
                        };

                        // Collect merged cells
                        if (worksheet['!merges']) {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            worksheet['!merges'].forEach((m: any) => {
                                // Check intersection with bounds
                                if (m.e.r >= startRow && m.s.r <= endRow && m.e.c >= startCol && m.s.c <= endCol) {
                                    result.mergedCells.push({
                                        range: `${colToLetter(m.s.c)}${m.s.r + 1}:${colToLetter(m.e.c)}${m.e.r + 1}`,
                                        master: `${colToLetter(m.s.c)}${m.s.r + 1}`,
                                        start: { r: m.s.r, c: m.s.c },
                                        end: { r: m.e.r, c: m.e.c }
                                    });
                                }
                            });
                        }

                        // Collect Cells
                        if (cells && cells.length > 0) {
                            cells.forEach(cellAddr => {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const cell = worksheet[cellAddr] as any;
                                result.cells[cellAddr] = cell ? { v: cell.v, w: cell.w, s: cell.s } : null;
                            });
                            result.range = 'Specific Cells';
                        } else {
                            for (let r = startRow; r <= endRow; r++) {
                                for (let c = startCol; c <= endCol; c++) {
                                    const addr = XLSX.utils.encode_cell({ r, c });
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    const cell = worksheet[addr] as any;
                                    if (cell) {
                                        result.cells[addr] = { v: cell.v, w: cell.w, s: cell.s };
                                    }
                                }
                            }
                        }

                        return JSON.stringify(result, null, 2);
                    }


                    // --- PREPARE GRID DATA (for Markdown/CSV) ---
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const rows: any[][] = [];
                    for (let row = startRow; row <= endRow; row++) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const rowData: any[] = [];
                        for (let col = startCol; col <= endCol; col++) {
                            const addr = `${colToLetter(col)}${row + 1}`;
                            let cellAddress = addr;

                            if (worksheet['!merges']) {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const merge = worksheet['!merges'].find((m: any) =>
                                    row >= m.s.r && row <= m.e.r && col >= m.s.c && col <= m.e.c
                                );
                                if (merge) {
                                    if (row === merge.s.r && col === merge.s.c) {
                                        cellAddress = `${colToLetter(merge.s.c)}${merge.s.r + 1}`;
                                    } else {
                                        cellAddress = ''; // Signal to look nowhere
                                    }
                                }
                            }

                            let value = '';
                            if (cellAddress) {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const cell = worksheet[cellAddress] as any;
                                value = cell ? (cell.w || cell.v) : '';
                                if (value === undefined || value === null) value = '';
                            }
                            rowData.push(value);
                        }
                        rows.push(rowData);
                    }


                    // --- MARKDOWN / CSV / ASCII ---
                    let result = `Grid View (${rangeStr}):\n\n`;

                    if (format === 'markdown') {
                        if (rows.length > 0) {
                            const headerRow = '| ' + Array.from({ length: endCol - startCol + 1 }, (_, i) => colToLetter(startCol + i)).join(' | ') + ' |';
                            const separatorRow = '| ' + Array.from({ length: endCol - startCol + 1 }, () => '---').join(' | ') + ' |';
                            result += headerRow + '\n' + separatorRow + '\n';
                            rows.forEach((row, idx) => {
                                result += '| ' + row.map(v => String(v).replace(/\|/g, '\\|').replace(/\n/g, '<br>')).join(' | ') + ` | **${startRow + idx + 1}**\n`;
                            });
                        }
                    } else if (format === 'csv') {
                        rows.forEach(row => {
                            result += row.map(v => {
                                const s = String(v);
                                return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s;
                            }).join(',') + '\n';
                        });
                    } else { // ascii
                        rows.forEach(row => {
                            result += row.map(v => String(v)).join('\t') + '\n';
                        });
                    }

                    // --- APPEND MERGE INFO (For Text Modes) ---
                    if (worksheet['!merges'] && worksheet['!merges'].length > 0) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const intersectingMerges = worksheet['!merges'].filter((m: any) =>
                            m.s.r <= endRow && m.e.r >= startRow &&
                            m.s.c <= endCol && m.e.c >= startCol
                        );
                        if (intersectingMerges.length > 0) {
                            result += '\nMerged Cells:\n';
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            intersectingMerges.forEach((m: any) => {
                                const rStr = `${colToLetter(m.s.c)}${m.s.r + 1}:${colToLetter(m.e.c)}${m.e.r + 1}`;
                                const mStr = `${colToLetter(m.s.c)}${m.s.r + 1}`;
                                result += `- ${rStr} (Master: ${mStr})\n`;
                            });
                        }
                    }

                    return result;

                } catch (error) {
                    console.error('[readSpreadsheet] Error:', error);
                    return `Error: ${error instanceof Error ? error.message : String(error)}`;
                }
            }
        ),

    ];
};
