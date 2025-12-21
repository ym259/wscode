'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';

// Fortune-sheet compatible sheet data type
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
    row?: number;
    column?: number;
}

/** Callback to update a cell value in both UI and workbook */
export type SetCellValueFn = (
    cell: string,
    value: string | number,
    sheetName?: string,
    isNumber?: boolean
) => void;

interface UseFortuneSheetResult {
    sheets: SheetData[];
    isReady: boolean;
    error: string | null;
    workbookRef: React.MutableRefObject<XLSX.WorkBook | null>;
    setCellValue: SetCellValueFn;
}

/**
 * Hook to parse xlsx file and manage Fortune-sheet state.
 * Converts SheetJS workbook format to Fortune-sheet data format.
 */
export function useFortuneSheet(file: File): UseFortuneSheetResult {
    const [sheets, setSheets] = useState<SheetData[]>([]);
    const [isReady, setIsReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const workbookRef = useRef<XLSX.WorkBook | null>(null);

    useEffect(() => {
        const parseXlsx = async () => {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const workbook = XLSX.read(arrayBuffer, { type: 'array' });

                // Store original workbook for save operations
                workbookRef.current = workbook;

                // Convert each sheet to Fortune-sheet format
                const fortuneSheets: SheetData[] = workbook.SheetNames.map((sheetName) => {
                    const worksheet = workbook.Sheets[sheetName];
                    const celldata: SheetData['celldata'] = [];

                    // Get the range of the worksheet
                    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');

                    // Iterate through all cells
                    for (let row = range.s.r; row <= range.e.r; row++) {
                        for (let col = range.s.c; col <= range.e.c; col++) {
                            const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
                            const cell = worksheet[cellAddress];

                            if (cell) {
                                celldata.push({
                                    r: row,
                                    c: col,
                                    v: {
                                        v: cell.v ?? undefined,
                                        m: cell.w || String(cell.v ?? ''),
                                    },
                                });
                            }
                        }
                    }

                    return {
                        name: sheetName,
                        celldata,
                        row: Math.max(range.e.r + 1, 50),
                        column: Math.max(range.e.c + 1, 26),
                    };
                });

                setSheets(fortuneSheets);
                setIsReady(true);
                setError(null);
            } catch (err) {
                console.error('Error parsing xlsx:', err);
                setError('Failed to load spreadsheet. Please check the file format.');
                setIsReady(false);
            }
        };

        parseXlsx();
    }, [file]);

    // Callback to update a cell value in both UI state and workbook ref
    const setCellValue: SetCellValueFn = useCallback((
        cell: string,
        value: string | number,
        sheetName?: string,
        isNumber?: boolean
    ) => {
        // Parse cell address (e.g., "A7" -> { r: 6, c: 0 })
        const cellRef = XLSX.utils.decode_cell(cell.toUpperCase());
        const row = cellRef.r;
        const col = cellRef.c;

        // Determine value type
        let cellValue: string | number = value;
        if (isNumber && typeof value === 'string') {
            const num = parseFloat(value);
            if (!isNaN(num)) cellValue = num;
        }

        // Update sheets state (for UI)
        setSheets(prevSheets => {
            const newSheets = [...prevSheets];
            const targetSheetIndex = sheetName
                ? newSheets.findIndex(s => s.name === sheetName)
                : 0;

            if (targetSheetIndex === -1) return prevSheets;

            const sheet = { ...newSheets[targetSheetIndex] };
            const celldata = [...(sheet.celldata || [])];

            // Find existing cell or add new one
            const existingIndex = celldata.findIndex(c => c.r === row && c.c === col);
            const newCell = {
                r: row,
                c: col,
                v: {
                    v: cellValue,
                    m: String(cellValue)
                }
            };

            if (existingIndex >= 0) {
                celldata[existingIndex] = newCell;
            } else {
                celldata.push(newCell);
            }

            sheet.celldata = celldata;
            newSheets[targetSheetIndex] = sheet;

            console.log(`[useFortuneSheet] setCellValue: ${cell} = ${cellValue}`);
            return newSheets;
        });

        // Also update workbook ref (for saving)
        if (workbookRef.current) {
            const targetSheet = sheetName || workbookRef.current.SheetNames[0];
            const worksheet = workbookRef.current.Sheets[targetSheet];
            if (worksheet) {
                XLSX.utils.sheet_add_aoa(worksheet, [[cellValue]], { origin: cell.toUpperCase() });
            }
        }
    }, []);

    return { sheets, isReady, error, workbookRef, setCellValue };
}
