'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useCallback, useRef, useEffect } from 'react';
import { Workbook } from '@fortune-sheet/react';
import '@fortune-sheet/react/dist/index.css';
import { Columns, Rows, RotateCcw, Image as ImageIcon } from 'lucide-react';
import styles from './XlsxEditor.module.css';
import { useFortuneSheet } from './hooks/useFortuneSheet';
import { useXlsxFileHandler } from './hooks/useXlsxFileHandler';
import { useUniversalAgent } from './hooks/useUniversalAgent';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { FileSystemItem } from '@/types';

interface XlsxEditorProps {
    file: File;
    fileName: string;
    handle?: FileSystemFileHandle;
}

// Helper to measure text width
const measureTextWidth = (text: string, font: string = '11pt "Arial"'): number => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return 0;
    context.font = font;
    const metrics = context.measureText(text);
    return metrics.width;
};

// Helper to estimate text height based on content (multi-line support)
const measureTextHeight = (text: string, colWidth: number, font: string = '11pt "Arial"'): number => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return 20; // Default row height
    context.font = font;

    // Check if text contains line breaks
    const lines = String(text).split('\n');
    const lineHeight = 20; // Base line height in pixels

    // Calculate wrapped lines for each line
    let totalLines = 0;
    for (const line of lines) {
        const textWidth = context.measureText(line).width;
        const wrappedLines = Math.max(1, Math.ceil(textWidth / (colWidth - 10))); // Account for padding
        totalLines += wrappedLines;
    }

    return Math.max(20, totalLines * lineHeight);
};

export default function XlsxEditor({ file, fileName, handle }: XlsxEditorProps) {
    const { setAIActionHandler, rootItems, openFile, setDocumentStats, libraryItems, openTabs, addWorkspaceItem } = useWorkspace();

    // Callback to add a newly created file to the workspace
    const addFileToWorkspace = useCallback((fileHandle: FileSystemFileHandle) => {
        addWorkspaceItem({
            name: fileHandle.name,
            path: fileHandle.name,
            type: 'file',
            handle: fileHandle,
        });
    }, [addWorkspaceItem]);

    // Parse xlsx and manage sheet state
    const { sheets, isReady, error: parseError, workbookRef } = useFortuneSheet(file);

    // Ref to Fortune-sheet Workbook instance for direct API calls
    const fortuneSheetRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);


    // Create a stable callback for setCellValue that uses the Fortune-sheet ref
    const setCellValueViaRef = useCallback((
        cell: string,
        value: string | number,
        sheetName?: string,
        options?: boolean | { isNumber?: boolean; isFormula?: boolean; style?: Record<string, unknown> }
    ) => {
        const workbook = fortuneSheetRef.current;
        if (!workbook) {
            console.warn('[XlsxEditor] Fortune-sheet ref not available');
            return;
        }

        // Normalize options (support boolean for backwards compat)
        const opts = typeof options === 'boolean' ? { isNumber: options } : (options || {});

        // Parse cell address (e.g., "A7" -> row 6, col 0)
        const colMatch = cell.match(/^([A-Z]+)/i);
        const rowMatch = cell.match(/(\d+)$/);

        if (!colMatch || !rowMatch) {
            console.error('[XlsxEditor] Invalid cell address:', cell);
            return;
        }

        // Convert column letter to index (A=0, B=1, etc.)
        const colStr = colMatch[1].toUpperCase();
        let colIdx = 0;
        for (let i = 0; i < colStr.length; i++) {
            colIdx = colIdx * 26 + (colStr.charCodeAt(i) - 64);
        }
        colIdx -= 1; // 0-indexed

        const rowIdx = parseInt(rowMatch[1], 10) - 1; // 0-indexed

        // Determine if value is a formula
        const isFormula = opts.isFormula || (typeof value === 'string' && value.startsWith('='));

        // Determine value type
        let cellValue: string | number = value;
        if (opts.isNumber && typeof value === 'string' && !isFormula) {
            const num = parseFloat(value);
            if (!isNaN(num)) cellValue = num;
        }

        console.log(`[XlsxEditor] setCellValue: ${cell} (row=${rowIdx}, col=${colIdx}) = ${isFormula ? value : cellValue}`);

        // Call Fortune-sheet API
        try {
            if (workbook.setCellValue) {
                // FortuneSheet setCellValue: (row, col, value, options?)
                // For formulas, we pass them as the value directly
                workbook.setCellValue(rowIdx, colIdx, isFormula ? value : cellValue);
            } else {
                console.warn('[XlsxEditor] setCellValue not available on workbook ref');
            }

            // Apply style if provided (using setCellFormat API)
            if (opts.style && workbook.setCellFormat) {
                for (const [attr, val] of Object.entries(opts.style)) {
                    workbook.setCellFormat(rowIdx, colIdx, attr, val);
                }
            }
        } catch (err) {
            console.error('[XlsxEditor] Error calling setCellValue:', err);
        }
    }, []);

    // Helper to find file by path and open it
    const openFileByPath = useCallback(async (path: string): Promise<boolean> => {
        // Normalize path for comparison
        const normalize = (p: string) => p.toLowerCase().replace(/\\/g, '/');
        const targetNorm = normalize(path);

        // Recursively search for file in workspace with flexible matching
        const findItem = (items: FileSystemItem[], parentPath: string = ''): FileSystemItem | null => {
            for (const item of items) {
                const fullPath = parentPath ? `${parentPath}/${item.name}` : item.name;
                const fullPathNorm = normalize(fullPath);
                const itemNameNorm = normalize(item.name);

                // Match: exact path, just filename, or path ending
                if (
                    fullPathNorm === targetNorm ||
                    itemNameNorm === targetNorm ||
                    fullPathNorm.endsWith('/' + targetNorm) ||
                    targetNorm.endsWith('/' + fullPathNorm) ||
                    // Match without directory prefix
                    itemNameNorm === normalize(path.split('/').pop() || path)
                ) {
                    if (item.type === 'file') return item;
                }

                if (item.children) {
                    const found = findItem(item.children, fullPath);
                    if (found) return found;
                }
            }
            return null;
        };

        const item = findItem(rootItems);
        if (!item || !item.handle) {
            console.warn('[XlsxEditor] File not found:', path);
            return false;
        }

        try {
            const fileHandle = item.handle as FileSystemFileHandle;
            const fileData = await fileHandle.getFile();
            openFile(item, fileData);
            return true;
        } catch (err) {
            console.error('[XlsxEditor] Error opening file:', err);
            return false;
        }
    }, [rootItems, openFile]);

    // Enable AI Assistant with unified agent
    useUniversalAgent({
        isReady,
        activeFilePath: fileName,
        activeFileType: 'xlsx',
        activeFileHandle: handle,
        workspaceFiles: rootItems,
        openTabs,
        libraryItems,
        setAIActionHandler,
        setCellValue: setCellValueViaRef,
        openFileInEditor: openFileByPath,
        addFileToWorkspace,
        getWorkbook: () => workbookRef.current
    });

    // Track latest sheet data for saving
    const latestSheetsRef = React.useRef(sheets);

    // Update stats when sheets load initially or change
    React.useEffect(() => {
        if (sheets.length > 0) {
            latestSheetsRef.current = sheets;

            // Calculate basic stats for Excel
            const sheetCount = sheets.length;
            const totalCells = sheets.reduce((count, sheet: any) => count + (sheet.celldata?.length || 0), 0);

            setDocumentStats({
                wordCount: 0,
                charCount: 0,
                lineCount: totalCells, // Using cell count as line count placeholder or just showing 0
                pageCount: sheetCount, // Using sheet count as page count placeholder
                fileType: 'XLSX'
            });
        }

        return () => {
            setDocumentStats(null);
        };
    }, [sheets, setDocumentStats]);

    // Handle file saving
    const { saveError, onSave } = useXlsxFileHandler(workbookRef, handle, fileName);

    // Keyboard shortcut for saving
    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                if (isReady && latestSheetsRef.current) {
                    onSave(latestSheetsRef.current);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onSave, isReady]);

    // Handle double click for auto-fit column width
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleDoubleClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;

            // 1. Check for specific resize handler classes (FortuneSheet uses 'fortune-' prefix)
            // The handler is usually a div class="fortune-cols-change-size" that appears on hover
            const isResizer = target.classList.contains('fortune-cols-change-size') ||
                target.classList.contains('fortune-change-size-col') ||
                target.classList.contains('luckysheet-cols-change-size') || // Legacy support
                target.classList.contains('luckysheet-change-size-col') ||
                target.style.cursor === 'col-resize';

            // If it's not a resizer and not near the header area, ignore
            // Header area is usually top ~20-30px.
            const rect = container.getBoundingClientRect();
            const relativeY = e.clientY - rect.top;
            const isHeaderArea = relativeY < 50; // generous threshold

            if (!isResizer && !isHeaderArea) return;

            console.log('[XlsxEditor] Double click detected in header area/resizer');

            if (sheets.length === 0) return;

            // 2. Determine Column Index
            // Since FortuneSheet renders on canvas, we often can't rely on DOM elements for index.
            // We must calculate it based on X coordinate.

            let colIndex = -1;

            // Try simple dataset approach first (if Element was clicked)
            if (target.dataset.colIndex) {
                colIndex = parseInt(target.dataset.colIndex, 10);
            }

            // Coordinate-based detection
            if (colIndex === -1) {
                const workbook = fortuneSheetRef.current;

                // We need the scroll offset. 
                // There are multiple scrollbars in DOM structure, typically 'fortune-scrollbar-x' 
                // or specific container. We'll try to find the scroll element.
                const scrollEl = container.querySelector('.fortune-scrollbar-x') ||
                    container.querySelector('.luckysheet-scrollbar-x');
                const scrollLeft = scrollEl ? scrollEl.scrollLeft : 0;

                // Get CURRENT column widths from the workbook ref (live data)
                // FortuneSheet exposes getColumnWidth({ columns: number[] }) which returns { [colIndex]: width }
                // We can also try getSheet().config.columnlen for the active sheet's current config
                let columnLen: Record<number, number> = {};
                let defaultColWidth = 73;

                if (workbook && typeof workbook.getSheet === 'function') {
                    try {
                        const activeSheet = workbook.getSheet();
                        if (activeSheet && activeSheet.config) {
                            columnLen = activeSheet.config.columnlen || {};
                            defaultColWidth = activeSheet.defaultColWidth || 73;
                        }
                    } catch (e) {
                        console.warn('[XlsxEditor] Could not get live sheet config', e);
                    }
                }

                // Fallback to initial sheets data if workbook API failed
                if (Object.keys(columnLen).length === 0) {
                    const sheet = sheets[0] as any;
                    const config = sheet.config || {};
                    columnLen = config.columnlen || {};
                    defaultColWidth = config.defaultColWidth || 73;
                }

                // We need to account for Row Header width (index column).
                // Usually ~46px.
                const rowHeaderWidth = 46;

                // Click X relative to container
                const clickX = e.clientX - rect.left;

                // Adjusted X pointer on the data grid
                const gridX = clickX - rowHeaderWidth + scrollLeft;

                // Iterate to find which column boundary is closest to gridX
                let currentPos = 0;
                // Check first 200 columns (safety limit)
                for (let i = 0; i < 200; i++) {
                    const width = columnLen[i] || defaultColWidth;
                    currentPos += width;

                    // Check if click is near this boundary ( +/- 10px )
                    if (Math.abs(currentPos - gridX) < 10) {
                        colIndex = i;
                        break;
                    }
                }
            }

            if (colIndex !== -1) {
                console.log(`[XlsxEditor] Detected column boundary for index: ${colIndex}`);

                const currentSheet = sheets[0]; // Assuming active
                if (!currentSheet || !currentSheet.celldata) return;

                // Measure max width
                let maxWidth = 0;
                currentSheet.celldata.forEach(cell => {
                    if (cell.c === colIndex && cell.v) {
                        const text = String(cell.v.m || cell.v.v || '');
                        const width = measureTextWidth(text);
                        if (width > maxWidth) maxWidth = width;
                    }
                });

                // Default min width and padding
                if (maxWidth === 0) maxWidth = 50;
                const newWidth = Math.ceil(maxWidth + 20); // Add 20px padding

                console.log(`[XlsxEditor] Auto-fitting column ${colIndex} to width ${newWidth}`);

                const workbook = fortuneSheetRef.current;
                if (workbook && typeof workbook.setColumnWidth === 'function') {
                    workbook.setColumnWidth({ [colIndex]: newWidth });
                } else {
                    console.warn('[XlsxEditor] setColumnWidth API not found on workbook ref');
                }
            }
        };

        container.addEventListener('dblclick', handleDoubleClick);

        return () => {
            container.removeEventListener('dblclick', handleDoubleClick);
        };
    }, [sheets]);

    // Auto-fit all column widths
    const autoFitAllColumns = useCallback(() => {
        const workbook = fortuneSheetRef.current;
        if (!workbook || sheets.length === 0) {
            console.warn('[XlsxEditor] Cannot auto-fit columns: workbook or sheets not available');
            return;
        }

        // Get active sheet data
        let activeSheet: any = null;
        if (typeof workbook.getSheet === 'function') {
            try {
                activeSheet = workbook.getSheet();
            } catch (e) {
                console.warn('[XlsxEditor] Could not get active sheet', e);
            }
        }

        // Fallback to first sheet from parsed data
        if (!activeSheet) {
            activeSheet = sheets[0];
        }

        if (!activeSheet || !activeSheet.celldata) {
            console.warn('[XlsxEditor] No cell data available');
            return;
        }

        // Find all columns with data and calculate optimal widths
        const columnWidths: Record<number, number> = {};
        const maxCol = activeSheet.celldata.reduce((max: number, cell: any) => Math.max(max, cell.c || 0), 0);

        for (let colIndex = 0; colIndex <= maxCol; colIndex++) {
            let maxWidth = 50; // Minimum width

            activeSheet.celldata.forEach((cell: any) => {
                if (cell.c === colIndex && cell.v) {
                    const text = String(cell.v.m || cell.v.v || '');
                    const width = measureTextWidth(text);
                    if (width > maxWidth) maxWidth = width;
                }
            });

            columnWidths[colIndex] = Math.ceil(maxWidth + 20); // Add padding
        }

        console.log('[XlsxEditor] Auto-fitting all columns:', columnWidths);

        if (typeof workbook.setColumnWidth === 'function') {
            workbook.setColumnWidth(columnWidths);
        } else {
            console.warn('[XlsxEditor] setColumnWidth API not available');
        }
    }, [sheets]);

    // Auto-fit all row heights
    const autoFitAllRows = useCallback(() => {
        const workbook = fortuneSheetRef.current;
        if (!workbook || sheets.length === 0) {
            console.warn('[XlsxEditor] Cannot auto-fit rows: workbook or sheets not available');
            return;
        }

        // Get active sheet data
        let activeSheet: any = null;
        if (typeof workbook.getSheet === 'function') {
            try {
                activeSheet = workbook.getSheet();
            } catch (e) {
                console.warn('[XlsxEditor] Could not get active sheet', e);
            }
        }

        // Fallback to first sheet from parsed data
        if (!activeSheet) {
            activeSheet = sheets[0];
        }

        if (!activeSheet || !activeSheet.celldata) {
            console.warn('[XlsxEditor] No cell data available');
            return;
        }

        // Get current column widths for wrap calculation
        const columnLen = activeSheet.config?.columnlen || {};
        const defaultColWidth = activeSheet.defaultColWidth || 73;

        // Find all rows with data and calculate optimal heights
        const rowHeights: Record<number, number> = {};
        const maxRow = activeSheet.celldata.reduce((max: number, cell: any) => Math.max(max, cell.r || 0), 0);

        for (let rowIndex = 0; rowIndex <= maxRow; rowIndex++) {
            let maxHeight = 20; // Minimum height (default row height)

            activeSheet.celldata.forEach((cell: any) => {
                if (cell.r === rowIndex && cell.v) {
                    const text = String(cell.v.m || cell.v.v || '');
                    const colWidth = columnLen[cell.c] || defaultColWidth;
                    const height = measureTextHeight(text, colWidth);
                    if (height > maxHeight) maxHeight = height;
                }
            });

            // Only set non-default heights to reduce API calls
            if (maxHeight > 20) {
                rowHeights[rowIndex] = Math.ceil(maxHeight + 4); // Add small padding
            }
        }

        console.log('[XlsxEditor] Auto-fitting all rows:', rowHeights);

        if (typeof workbook.setRowHeight === 'function') {
            workbook.setRowHeight(rowHeights);
        } else {
            console.warn('[XlsxEditor] setRowHeight API not available');
        }
    }, [sheets]);

    // Reset all column widths and row heights to defaults
    const resetAllSizes = useCallback(() => {
        const workbook = fortuneSheetRef.current;
        if (!workbook || sheets.length === 0) {
            console.warn('[XlsxEditor] Cannot reset sizes: workbook or sheets not available');
            return;
        }

        // Get active sheet data
        let activeSheet: any = null;
        if (typeof workbook.getSheet === 'function') {
            try {
                activeSheet = workbook.getSheet();
            } catch (e) {
                console.warn('[XlsxEditor] Could not get active sheet', e);
            }
        }

        // Fallback to first sheet from parsed data
        if (!activeSheet) {
            activeSheet = sheets[0];
        }

        if (!activeSheet || !activeSheet.celldata) {
            console.warn('[XlsxEditor] No cell data available');
            return;
        }

        // Default dimensions
        const defaultColWidth = 73;
        const defaultRowHeight = 20;

        // Find max column and row with data
        const maxCol = activeSheet.celldata.reduce((max: number, cell: any) => Math.max(max, cell.c || 0), 0);
        const maxRow = activeSheet.celldata.reduce((max: number, cell: any) => Math.max(max, cell.r || 0), 0);

        // Reset all columns to default width
        const columnWidths: Record<number, number> = {};
        for (let colIndex = 0; colIndex <= maxCol; colIndex++) {
            columnWidths[colIndex] = defaultColWidth;
        }

        // Reset all rows to default height
        const rowHeights: Record<number, number> = {};
        for (let rowIndex = 0; rowIndex <= maxRow; rowIndex++) {
            rowHeights[rowIndex] = defaultRowHeight;
        }

        console.log('[XlsxEditor] Resetting all sizes to defaults');

        if (typeof workbook.setColumnWidth === 'function') {
            workbook.setColumnWidth(columnWidths);
        } else {
            console.warn('[XlsxEditor] setColumnWidth API not available');
        }

        if (typeof workbook.setRowHeight === 'function') {
            workbook.setRowHeight(rowHeights);
        } else {
            console.warn('[XlsxEditor] setRowHeight API not available');
        }
    }, [sheets]);

    // Test Image Generation
    const testImageGeneration = useCallback(async () => {
        if (sheets.length === 0) return;

        console.log('[XlsxEditor] Testing image generation (Overflow support)...');
        const sheet = sheets[0] as any;
        const config = sheet.config || {};
        const celldata = sheet.celldata || [];
        const mergeConf = config.merge || {};
        const columnLen = config.columnlen || {};
        const rowLen = config.rowlen || {};

        // Settings
        const defaultColWidth = 73;
        const defaultRowHeight = 20;
        const padding = 2;
        const headerBg = '#f4f5f8';
        const borderColor = '#d4d4d4';

        // 1. Calculate Bounds (Data vs Config)
        let maxRow = 0;
        let maxCol = 0;

        // Check data
        celldata.forEach((c: any) => {
            if (c.r > maxRow) maxRow = c.r;
            if (c.c > maxCol) maxCol = c.c;
        });

        // Check config (column width settings often imply used area)
        Object.keys(columnLen).forEach(k => {
            const idx = parseInt(k, 10);
            if (!isNaN(idx) && idx > maxCol) maxCol = idx;
        });
        Object.keys(rowLen).forEach(k => {
            const idx = parseInt(k, 10);
            if (!isNaN(idx) && idx > maxRow) maxRow = idx;
        });

        // Limits - increased to 100 cols / 200 rows or max+5
        const rowsToRender = Math.min(Math.max(maxRow + 5, 50), 300);
        const colsToRender = Math.min(Math.max(maxCol + 5, 20), 100);

        const rowHeaderWidth = 80;
        const colHeaderHeight = 32;

        // Helper: Accessors with safe types
        const getColWidth = (c: number): number => {
            const w = columnLen[c]; // might be string or number
            return w ? parseFloat(String(w)) : defaultColWidth;
        };
        const getRowHeight = (r: number): number => {
            const h = rowLen[r];
            return h ? parseFloat(String(h)) : defaultRowHeight;
        };

        // Calculate cumulative positions
        let totalWidth = rowHeaderWidth;
        const colPositions = [rowHeaderWidth];
        const colWidthsCache: number[] = [];
        for (let c = 0; c < colsToRender; c++) {
            const w = getColWidth(c);
            colWidthsCache[c] = w;
            totalWidth += w;
            colPositions.push(totalWidth);
        }

        let totalHeight = colHeaderHeight;
        const rowPositions = [colHeaderHeight];
        const rowHeightsCache: number[] = [];
        for (let r = 0; r < rowsToRender; r++) {
            const h = getRowHeight(r);
            rowHeightsCache[r] = h;
            totalHeight += h;
            rowPositions.push(totalHeight);
        }

        const canvas = document.createElement('canvas');
        const dpr = window.devicePixelRatio || 1;

        // Safety cap for extremely large canvases
        const MAX_DIM = 8000;
        if (totalWidth * dpr > MAX_DIM || totalHeight * dpr > MAX_DIM) {
            console.warn('[XlsxEditor] Canvas too large, clamping.');
            // This is just a test tool, so we won't implement complex tiling
        }

        canvas.width = totalWidth * dpr;
        canvas.height = totalHeight * dpr;
        canvas.style.width = `${totalWidth}px`;
        canvas.style.height = `${totalHeight}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.scale(dpr, dpr);
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, totalWidth, totalHeight);

        // --- DRAWING ---

        // 2. Grid Lines & Headers
        ctx.lineWidth = 1;

        // Pass 1: Backgrounds & Borders

        // Column Headers Background
        for (let c = 0; c < colsToRender; c++) {
            const x = colPositions[c];
            const w = colWidthsCache[c];
            ctx.fillStyle = headerBg;
            ctx.fillRect(x, 0, w, colHeaderHeight);
            ctx.strokeStyle = borderColor;
            ctx.strokeRect(x - 0.5, 0 - 0.5, w + 1, colHeaderHeight + 1);
        }

        // Row Headers Background & Vertical Grid Lines
        for (let r = 0; r < rowsToRender; r++) {
            const y = rowPositions[r];
            const h = rowHeightsCache[r];

            // Header Background
            ctx.fillStyle = headerBg;
            ctx.fillRect(0, y, rowHeaderWidth, h);
            ctx.strokeStyle = borderColor;
            ctx.strokeRect(0, y, rowHeaderWidth, h);

            // Cells Grid
            for (let c = 0; c < colsToRender; c++) {
                const x = colPositions[c];
                const w = colWidthsCache[c];
                ctx.strokeStyle = borderColor;
                ctx.strokeRect(x, y, w, h);
            }
        }

        // Pass 2: Header Text (On Top, allowing overflow)
        ctx.fillStyle = '#666';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Column Labels
        for (let c = 0; c < colsToRender; c++) {
            // Sparse indexing: every 5 columns
            if (c % 5 === 0) {
                const x = colPositions[c];
                const w = colWidthsCache[c];

                let label = '';
                let temp = c;
                do {
                    label = String.fromCharCode((temp % 26) + 65) + label;
                    temp = Math.floor(temp / 26) - 1;
                } while (temp >= 0);

                ctx.fillText(label, x + (w / 2), colHeaderHeight / 2);
            }
        }

        // Row Labels
        for (let r = 0; r < rowsToRender; r++) {
            // Sparse indexing: every 5 rows
            if (r % 5 === 0) {
                const y = rowPositions[r];
                const h = rowHeightsCache[r];
                ctx.fillText(String(r + 1), rowHeaderWidth / 2, y + (h / 2));
            }
        }

        // 3. Merged Cells (Background clearing)
        const getMergeRange = (r: number, c: number) => {
            const key = `${r}_${c}`;
            return mergeConf[key] || null;
        };

        Object.keys(mergeConf).forEach(key => {
            const merge = mergeConf[key];
            const r = merge.r;
            const c = merge.c;

            if (r >= rowsToRender || c >= colsToRender) return;

            const x = colPositions[c];
            const y = rowPositions[r];
            let w = 0;
            let h = 0;

            for (let i = 0; i < merge.cs; i++) w += (colWidthsCache[c + i] || defaultColWidth);
            for (let i = 0; i < merge.rs; i++) h += (rowHeightsCache[r + i] || defaultRowHeight);

            // Clear grid lines
            ctx.fillStyle = 'white';
            ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
            // Optional: Draw border around merge? Xlsx usually doesn't enforce thick border unless styled
        });

        // 4. Content with Overflow
        // To handle overflow:
        // Identify if a cell has content. 
        // If it's a merge, draw strictly in merge bounds.
        // If it's a normal cell, check neighbors to the right.

        const cellMap = new Map<string, any>();
        celldata.forEach((c: any) => cellMap.set(`${c.r}_${c.c}`, c));

        const isCellEmpty = (r: number, c: number) => {
            if (c >= colsToRender) return false; // Stop at edge
            const cell = cellMap.get(`${r}_${c}`);
            const val = cell?.v?.m || cell?.v?.v;
            return !val; // Empty if no value
        };

        celldata.forEach((cell: any) => {
            const { r, c } = cell;
            if (r >= rowsToRender || c >= colsToRender) return;

            const val = cell?.v?.m || cell?.v?.v || '';
            if (!val) return; // Skip empty cells (handling overflow from others is separate? No, we iterate source)

            const merge = getMergeRange(r, c);

            const x = colPositions[c];
            const y = rowPositions[r];
            let w = colWidthsCache[c];
            let h = rowHeightsCache[r];

            if (merge) {
                // Calculation dimensions again
                w = 0; h = 0;
                for (let i = 0; i < merge.cs; i++) w += (colWidthsCache[c + i] || defaultColWidth);
                for (let i = 0; i < merge.rs; i++) h += (rowHeightsCache[r + i] || defaultRowHeight);
            } else {
                // Not a merge top-left.
                // Check if we are inside someone else's merge?
                // Logic: A simplified "is cell inside merge" is hard without 2D array.
                // But overflow usually only happens if NOT merged.
                // We'll perform a quick check: do we overflow?

                // Calculate overflow width
                // Look ahead 
                let extraWidth = 0;
                let nextC = c + 1;
                while (nextC < colsToRender && isCellEmpty(r, nextC)) {
                    // Also check if nextC is part of a merge? (Too complex for now, assume empty = free)
                    extraWidth += colWidthsCache[nextC];
                    nextC++;
                    // Cap overflow to avoiding massive loops
                    if (nextC > c + 10) break;
                }

                if (extraWidth > 0) {
                    w += extraWidth;
                }
            }

            // Draw content
            ctx.fillStyle = '#000';
            ctx.font = '11pt Arial';
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';

            const textX = x + padding;
            const textY = y + (h / 2);

            // Clip to allocated space (cell + overflow)
            ctx.save();
            ctx.beginPath();
            ctx.rect(x, y, w, h);
            ctx.clip();
            ctx.fillText(String(val), textX, textY);
            ctx.restore();
        });

        try {
            const dataUrl = canvas.toDataURL('image/png');
            console.log(`[XlsxEditor] Generated: ${canvas.width}x${canvas.height} (DPR ${dpr})`);

            const win = window.open();
            if (win) {
                win.document.write(`
                    <html>
                    <head><title>Generated Image Test</title></head>
                    <body style="background: #f0f0f0; padding: 20px;">
                        <h3>Generated Image (${canvas.width}x${canvas.height})</h3>
                        <div style="margin-bottom: 10px; color: #666;">
                            Includes: ${colsToRender} cols, ${rowsToRender} rows. Overflow support active.
                        </div>
                        <img src="${dataUrl}" style="box-shadow: 0 4px 12px rgba(0,0,0,0.1); border: 1px solid #ddd; max-width: 100%;" />
                    </body>
                    </html>
                `);
            }
        } catch (err) {
            console.error('[XlsxEditor] Test failed:', err);
            alert('Image generation failed: ' + String(err));
        }
    }, [sheets]);

    // Unified error handling
    const error = parseError || saveError;

    if (error) {
        return (
            <div className={styles.error}>
                <p>{error}</p>
                <p className={styles.hint}>
                    Please check that the file is a valid Excel spreadsheet.
                </p>
            </div>
        );
    }





    return (
        <div className={styles.wrapper}>
            {/* Custom Toolbar */}
            {isReady && sheets.length > 0 && (
                <div className={styles.toolbar}>
                    <div className={styles.toolbarGroup}>
                        <button
                            className={styles.toolbarButton}
                            onClick={autoFitAllColumns}
                            title="Auto-fit all column widths"
                        >
                            <Columns size={16} />
                            <span>Auto-fit Columns</span>
                        </button>
                        <button
                            className={styles.toolbarButton}
                            onClick={autoFitAllRows}
                            title="Auto-fit all row heights"
                        >
                            <Rows size={16} />
                            <span>Auto-fit Rows</span>
                        </button>
                        <div className={styles.toolbarDivider} />
                        <button
                            className={styles.toolbarButton}
                            onClick={resetAllSizes}
                            title="Reset all column widths and row heights to defaults"
                        >
                            <RotateCcw size={16} />
                            <span>Reset Sizes</span>
                        </button>
                        <div className={styles.toolbarDivider} />
                        <button
                            className={styles.toolbarButton}
                            onClick={testImageGeneration}
                            title="Debug: Test Image Generation"
                        >
                            <ImageIcon size={16} />
                            <span>Test Image</span>
                        </button>
                    </div>
                </div>
            )}

            <div className={`${styles.container} ${isReady ? styles.ready : ''}`}>
                {isReady && sheets.length > 0 && (
                    <div ref={containerRef} className={styles.sheetContainer}>
                        <Workbook
                            ref={fortuneSheetRef}
                            data={sheets}
                            onChange={(data: any) => {
                                // Update workbook ref when data changes
                                latestSheetsRef.current = data;
                            }}
                        />
                    </div>
                )}
            </div>
            {!isReady && (
                <div className={styles.loadingOverlay}>
                    <div className={styles.spinner} />
                    <span>Loading spreadsheet...</span>
                </div>
            )}
        </div>
    );
}
