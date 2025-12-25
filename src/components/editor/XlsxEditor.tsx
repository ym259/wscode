'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useCallback, useRef } from 'react';
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

export default function XlsxEditor({ file, fileName, handle }: XlsxEditorProps) {
    const { setAIActionHandler, rootItems, openFile } = useWorkspace();

    // Parse xlsx and manage sheet state
    const { sheets, isReady, error: parseError, workbookRef } = useFortuneSheet(file);

    // Ref to Fortune-sheet Workbook instance for direct API calls
    const fortuneSheetRef = useRef<any>(null);

    // Create a stable callback for setCellValue that uses the Fortune-sheet ref
    const setCellValueViaRef = useCallback((
        cell: string,
        value: string | number,
        sheetName?: string,
        isNumber?: boolean
    ) => {
        const workbook = fortuneSheetRef.current;
        if (!workbook) {
            console.warn('[XlsxEditor] Fortune-sheet ref not available');
            return;
        }

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

        // Determine value type
        let cellValue: string | number = value;
        if (isNumber && typeof value === 'string') {
            const num = parseFloat(value);
            if (!isNaN(num)) cellValue = num;
        }

        console.log(`[XlsxEditor] setCellValue: ${cell} (row=${rowIdx}, col=${colIdx}) = ${cellValue}`);

        // Call Fortune-sheet API
        try {
            if (workbook.setCellValue) {
                workbook.setCellValue(rowIdx, colIdx, cellValue);
            } else {
                console.warn('[XlsxEditor] setCellValue not available on workbook ref');
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

    // Update ref when sheets load initially
    React.useEffect(() => {
        if (sheets.length > 0) {
            latestSheetsRef.current = sheets;
        }
    }, [sheets]);

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
                    <div className={styles.sheetContainer}>
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
