/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';

interface UseXlsxFileHandlerResult {
    saveError: string | null;
    isSaving: boolean;
}

/**
 * Hook for xlsx file save operations.
 * Uses File System Access API when handle is available, falls back to download.
 */
export interface SheetData {
    name: string;
    celldata?: Array<{
        r: number;
        c: number;
        v: {
            v?: string | number | boolean;
            m?: string | number;
        };
    }>;
}

export function useXlsxFileHandler(
    initialWorkbookRef: React.MutableRefObject<any>,
    handle: FileSystemFileHandle | undefined,
    fileName: string
): { saveError: string | null; isSaving: boolean; onSave: (sheets: SheetData[]) => Promise<void> } {
    const [saveError, setSaveError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // Save function that accepts current sheets state
    const saveFile = useCallback(async (sheets: SheetData[]) => {
        if (isSaving) return;

        setIsSaving(true);
        setSaveError(null);

        try {
            // Convert FortuneSheet data to SheetJS workbook
            const XLSX = await import('xlsx');
            const newWorkbook = XLSX.utils.book_new();

            sheets.forEach(sheet => {
                const worksheet: any = {};
                const celldata = sheet.celldata || [];

                if (celldata.length > 0) {
                    const range = { s: { c: 10000000, r: 10000000 }, e: { c: 0, r: 0 } };

                    celldata.forEach(cell => {
                        const r = cell.r;
                        const c = cell.c;

                        // Update range
                        if (r < range.s.r) range.s.r = r;
                        if (c < range.s.c) range.s.c = c;
                        if (r > range.e.r) range.e.r = r;
                        if (c > range.e.c) range.e.c = c;

                        const cellRef = XLSX.utils.encode_cell({ r, c });
                        const cellValue = cell.v?.v;

                        // Basic cell object
                        const cellObj: any = { v: cellValue };

                        if (typeof cellValue === 'number') {
                            cellObj.t = 'n';
                        } else if (typeof cellValue === 'boolean') {
                            cellObj.t = 'b';
                        } else {
                            cellObj.t = 's';
                        }

                        worksheet[cellRef] = cellObj;
                    });

                    worksheet['!ref'] = XLSX.utils.encode_range(range);
                } else {
                    worksheet['!ref'] = 'A1:A1';
                }

                XLSX.utils.book_append_sheet(newWorkbook, worksheet, sheet.name);
            });

            // Generate xlsx file
            const xlsxData = XLSX.write(newWorkbook, {
                type: 'array',
                bookType: 'xlsx'
            });
            const blob = new Blob([xlsxData], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });

            if (handle) {
                // Use File System Access API
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();
            } else {
                // Fall back to download
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                a.click();
                URL.revokeObjectURL(url);
            }
        } catch (err) {
            console.error('Error saving xlsx:', err);
            setSaveError('Failed to save spreadsheet.');
        } finally {
            setIsSaving(false);
        }
    }, [handle, fileName, isSaving]);

    // Expose a trigger method that can be attached to keyboard shortcuts
    // Note: Since we need the latest 'sheets' state, the component using this hook
    // must call onSave(currentSheets)

    return { saveError, isSaving, onSave: saveFile };
}
