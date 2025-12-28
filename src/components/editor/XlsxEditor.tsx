'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useCallback, useRef, useEffect } from 'react';
import { Workbook } from '@fortune-sheet/react';
import '@fortune-sheet/react/dist/index.css';
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

export default function XlsxEditor({ file, fileName, handle }: XlsxEditorProps) {
    const { setAIActionHandler, rootItems, openFile, setDocumentStats } = useWorkspace();

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
        setAIActionHandler,
        setCellValue: setCellValueViaRef,
        openFileInEditor: openFileByPath
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
