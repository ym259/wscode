'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx-js-style';

// FortuneSheet cell style type
export interface CellStyle {
    ff?: string;        // font family
    fs?: number;        // font size
    fc?: string;        // font color (hex, e.g., '#FF0000')
    bg?: string;        // background color (hex)
    bl?: 0 | 1;         // bold
    it?: 0 | 1;         // italic
    ht?: 0 | 1 | 2;     // horizontal align: 0=center, 1=left, 2=right
    vt?: 0 | 1 | 2;     // vertical align: 0=middle, 1=top, 2=bottom
}

// FortuneSheet cell type (number format)
export interface CellType {
    fa?: string;  // format string (e.g., '$#,##0.00', '0.0%')
    t?: string;   // type ('n'=number, 's'=string, etc.)
}

// Fortune-sheet compatible cell data
export interface CellData {
    r: number;
    c: number;
    v: {
        v?: string | number | boolean;  // raw value
        m?: string | number;             // display text
        f?: string;                       // formula (e.g., '=SUM(A1:A10)')
        ct?: CellType;                    // cell type with format
    };
    s?: CellStyle;  // style object
}

// Fortune-sheet compatible sheet data type
export interface SheetData {
    name: string;
    celldata?: CellData[];
    row?: number;
    column?: number;
}

/** Options for setCellValue */
export interface SetCellValueOptions {
    isNumber?: boolean;
    isFormula?: boolean;
    style?: CellStyle;
}

/** Callback to update a cell value in both UI and workbook */
export type SetCellValueFn = (
    cell: string,
    value: string | number,
    sheetName?: string,
    options?: boolean | SetCellValueOptions  // boolean for backwards compat (isNumber)
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
                // Enable cellStyles to parse styles from xlsx-js-style
                const workbook = XLSX.read(arrayBuffer, { type: 'array', cellStyles: true });

                // Store original workbook for save operations
                workbookRef.current = workbook;

                // Helper to convert ARGB color to hex (xlsx-js-style uses ARGB format)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const toHexColor = (color: any): string | undefined => {
                    if (!color) return undefined;
                    // xlsx-js-style stores colors as { rgb: 'AARRGGBB' } or { theme: n }
                    if (color.rgb) {
                        // Remove alpha channel if present (ARGB -> RGB)
                        const rgb = color.rgb.length === 8 ? color.rgb.slice(2) : color.rgb;
                        return `#${rgb}`;
                    }
                    return undefined;
                };

                // Convert each sheet to Fortune-sheet format
                const fortuneSheets: SheetData[] = workbook.SheetNames.map((sheetName) => {
                    const worksheet = workbook.Sheets[sheetName];
                    const celldata: CellData[] = [];

                    // Get the range of the worksheet
                    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');

                    // Iterate through all cells
                    for (let row = range.s.r; row <= range.e.r; row++) {
                        for (let col = range.s.c; col <= range.e.c; col++) {
                            const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const cell = worksheet[cellAddress] as any;

                            if (cell) {
                                // Build cell data with value, formula, and display text
                                const cellDataEntry: CellData = {
                                    r: row,
                                    c: col,
                                    v: {
                                        v: cell.v ?? undefined,
                                        m: cell.w || String(cell.v ?? ''),
                                    },
                                };

                                // Add formula if present
                                if (cell.f) {
                                    cellDataEntry.v.f = cell.f;
                                }

                                // Add number format if present
                                if (cell.z) {
                                    cellDataEntry.v.ct = { fa: cell.z, t: cell.t };
                                }

                                // Extract styles from xlsx-js-style (cell.s)
                                if (cell.s) {
                                    const style: CellStyle = {};

                                    // Background color (fill.fgColor)
                                    if (cell.s.fill?.fgColor) {
                                        const bg = toHexColor(cell.s.fill.fgColor);
                                        if (bg) style.bg = bg;
                                    }

                                    // Font properties
                                    if (cell.s.font) {
                                        // Font color
                                        if (cell.s.font.color) {
                                            const fc = toHexColor(cell.s.font.color);
                                            if (fc) style.fc = fc;
                                        }
                                        // Bold
                                        if (cell.s.font.bold) {
                                            style.bl = 1;
                                        }
                                        // Italic
                                        if (cell.s.font.italic) {
                                            style.it = 1;
                                        }
                                        // Font size
                                        if (cell.s.font.sz) {
                                            style.fs = cell.s.font.sz;
                                        }
                                        // Font family
                                        if (cell.s.font.name) {
                                            style.ff = cell.s.font.name;
                                        }
                                    }

                                    // Horizontal alignment
                                    if (cell.s.alignment?.horizontal) {
                                        const hMap: Record<string, 0 | 1 | 2> = {
                                            center: 0, left: 1, right: 2
                                        };
                                        style.ht = hMap[cell.s.alignment.horizontal] ?? 1;
                                    }

                                    // Vertical alignment
                                    if (cell.s.alignment?.vertical) {
                                        const vMap: Record<string, 0 | 1 | 2> = {
                                            center: 0, top: 1, bottom: 2
                                        };
                                        style.vt = vMap[cell.s.alignment.vertical] ?? 0;
                                    }

                                    // Only add style if it has properties
                                    if (Object.keys(style).length > 0) {
                                        cellDataEntry.s = style;
                                    }
                                }

                                celldata.push(cellDataEntry);
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
        options?: boolean | SetCellValueOptions
    ) => {
        // Parse cell address (e.g., "A7" -> { r: 6, c: 0 })
        const cellRef = XLSX.utils.decode_cell(cell.toUpperCase());
        const row = cellRef.r;
        const col = cellRef.c;

        // Normalize options (support boolean for backwards compat)
        const opts: SetCellValueOptions = typeof options === 'boolean'
            ? { isNumber: options }
            : (options || {});

        // Determine value type
        let cellValue: string | number = value;
        if (opts.isNumber && typeof value === 'string') {
            const num = parseFloat(value);
            if (!isNaN(num)) cellValue = num;
        }

        // Check if value is a formula
        const isFormula = opts.isFormula || (typeof value === 'string' && value.startsWith('='));
        const formula = isFormula ? String(value) : undefined;

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
            const newCell: CellData = {
                r: row,
                c: col,
                v: {
                    v: isFormula ? undefined : cellValue,  // Formulas: value calculated later
                    m: String(cellValue),
                    f: formula,
                },
            };

            // Apply style if provided
            if (opts.style) {
                newCell.s = opts.style;
            } else if (existingIndex >= 0 && celldata[existingIndex].s) {
                // Preserve existing style if not overwriting
                newCell.s = celldata[existingIndex].s;
            }

            if (existingIndex >= 0) {
                celldata[existingIndex] = newCell;
            } else {
                celldata.push(newCell);
            }

            sheet.celldata = celldata;
            newSheets[targetSheetIndex] = sheet;

            console.log(`[useFortuneSheet] setCellValue: ${cell} = ${isFormula ? formula : cellValue}`);
            return newSheets;
        });

        // Also update workbook ref (for saving)
        if (workbookRef.current) {
            const targetSheet = sheetName || workbookRef.current.SheetNames[0];
            const worksheet = workbookRef.current.Sheets[targetSheet];
            if (worksheet) {
                if (isFormula && formula) {
                    // For formulas, set cell with formula property
                    const cellAddr = cell.toUpperCase();
                    worksheet[cellAddr] = { f: formula.slice(1), t: 'n' }; // Remove leading '='
                } else {
                    XLSX.utils.sheet_add_aoa(worksheet, [[cellValue]], { origin: cell.toUpperCase() });
                }
            }
        }
    }, []);

    return { sheets, isReady, error, workbookRef, setCellValue };
}
