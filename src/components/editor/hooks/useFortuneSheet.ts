'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx-js-style';
import { XMLParser } from 'fast-xml-parser';

// FortuneSheet cell style type (styles go directly in the v object)
export interface CellStyle {
    ff?: number | string; // font family (index or name)
    fs?: number;          // font size
    fc?: string;          // font color (hex, e.g., '#FF0000')
    bg?: string;          // background color (hex)
    bl?: number;          // bold (0 or 1)
    it?: number;          // italic (0 or 1)
    cl?: number;          // strikethrough (0 or 1)
    un?: number;          // underline (0 or 1)
    ht?: number;          // horizontal align: 0=center, 1=left, 2=right
    vt?: number;          // vertical align: 0=middle, 1=top, 2=bottom
    tb?: string;          // text wrap/break: '1'=wrap, '2'=overflow
    tr?: string;          // text rotation
}

// FortuneSheet cell type (number format)
export interface CellType {
    fa?: string;  // format string (e.g., '$#,##0.00', '0.0%')
    t?: string;   // type ('n'=number, 's'=string, etc.)
}

// Fortune-sheet compatible cell value (includes styles directly)
export interface CellValue extends CellStyle {
    v?: string | number | boolean;  // raw value
    m?: string | number;            // display text
    f?: string;                     // formula (e.g., '=SUM(A1:A10)')
    ct?: CellType;                  // cell type with format
    mc?: {                          // merge cell info
        r: number;
        c: number;
        rs?: number;
        cs?: number;
    };
}

// Fortune-sheet compatible cell data
export interface CellData {
    r: number;
    c: number;
    v: CellValue | null;
}

// Fortune-sheet merge config
export interface MergeConfig {
    r: number;  // starting row
    c: number;  // starting column
    rs: number; // row span
    cs: number; // column span
}

// Fortune-sheet border info
export interface BorderInfo {
    rangeType: 'range' | 'cell';
    borderType?: 'border-all' | 'border-outside' | 'border-inside' | 'border-horizontal' | 'border-vertical' | 'border-none' | 'border-left' | 'border-right' | 'border-top' | 'border-bottom';
    color?: string;
    style?: number; // 1=thin, 2=hair, 3=dotted, etc.
    range?: Array<{ row: number[]; column: number[] }>;
    value?: {
        row_index: number;
        col_index: number;
        l?: { color: string; style: number };
        r?: { color: string; style: number };
        t?: { color: string; style: number };
        b?: { color: string; style: number };
    };
}

// Fortune-sheet sheet config
export interface SheetConfig {
    merge?: Record<string, MergeConfig>;
    rowlen?: Record<string, number>;
    columnlen?: Record<string, number>;
    borderInfo?: BorderInfo[];
}

// Fortune-sheet compatible sheet data type
export interface SheetData {
    name: string;
    celldata?: CellData[];
    config?: SheetConfig;
    row?: number;
    column?: number;
    defaultRowHeight?: number;
    defaultColWidth?: number;
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
                const workbook = XLSX.read(arrayBuffer, { type: 'array', cellStyles: true, bookFiles: true });

                // Store original workbook for save operations
                workbookRef.current = workbook;

                // Theme colors from workbook (common Excel theme colors)
                const defaultThemeColors: string[] = [
                    'FFFFFF', // 0 - background1 (light)
                    '000000', // 1 - text1 (dark)
                    'E7E6E6', // 2 - background2
                    '44546A', // 3 - text2
                    '4472C4', // 4 - accent1
                    'ED7D31', // 5 - accent2
                    'A5A5A5', // 6 - accent3
                    'FFC000', // 7 - accent4
                    '5B9BD5', // 8 - accent5
                    '70AD47', // 9 - accent6
                ];

                const parseThemeColorsFromXml = (themeXml: string): string[] | null => {
                    try {
                        const parser = new XMLParser({
                            ignoreAttributes: false,
                            attributeNamePrefix: '',
                        });
                        const doc = parser.parse(themeXml);
                        const themeRoot = doc?.theme || doc?.['a:theme'];
                        const themeElements = themeRoot?.themeElements || themeRoot?.['a:themeElements'];
                        const clrScheme = themeElements?.clrScheme || themeElements?.['a:clrScheme'];
                        if (!clrScheme) return null;

                        const keys = [
                            'lt1', 'dk1', 'lt2', 'dk2',
                            'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6',
                        ];

                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const resolveColor = (node: any): string | undefined => {
                            const srgb = node?.srgbClr?.val || node?.['a:srgbClr']?.val;
                            const sys = node?.sysClr?.lastClr || node?.['a:sysClr']?.lastClr;
                            const color = srgb || sys;
                            return typeof color === 'string' ? color.toUpperCase() : undefined;
                        };

                        const colors = keys.map((key) => {
                            const node = clrScheme[key] || clrScheme[`a:${key}`];
                            return resolveColor(node);
                        });

                        if (colors.every(Boolean)) {
                            return colors as string[];
                        }
                    } catch (err) {
                        console.warn('[useFortuneSheet] Failed to parse theme colors:', err);
                    }
                    return null;
                };

                const themeColors: string[] = (() => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const themeXml = (workbook as any)?.Files?.['xl/theme/theme1.xml'];
                    if (typeof themeXml === 'string') {
                        const parsed = parseThemeColorsFromXml(themeXml);
                        if (parsed) return parsed;
                    }
                    return defaultThemeColors;
                })();

                // Helper to apply tint to a color (for theme colors with tint)
                const applyTint = (hexColor: string, tint: number): string => {
                    const r = parseInt(hexColor.slice(0, 2), 16);
                    const g = parseInt(hexColor.slice(2, 4), 16);
                    const b = parseInt(hexColor.slice(4, 6), 16);

                    const applyTintToChannel = (channel: number, t: number): number => {
                        if (t < 0) {
                            return Math.round(channel * (1 + t));
                        } else {
                            return Math.round(channel + (255 - channel) * t);
                        }
                    };

                    const newR = Math.min(255, Math.max(0, applyTintToChannel(r, tint)));
                    const newG = Math.min(255, Math.max(0, applyTintToChannel(g, tint)));
                    const newB = Math.min(255, Math.max(0, applyTintToChannel(b, tint)));

                    return `${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`.toUpperCase();
                };

                // Helper to convert color to hex
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const toHexColor = (color: any): string | undefined => {
                    if (!color) return undefined;

                    // Handle theme colors
                    if (typeof color.theme === 'number') {
                        const baseColor = themeColors[color.theme] || 'FFFFFF';
                        if (color.tint !== undefined && color.tint !== 0) {
                            return `#${applyTint(baseColor, color.tint)}`;
                        }
                        return `#${baseColor}`;
                    }

                    // Handle indexed colors
                    if (typeof color.indexed === 'number') {
                        const indexedColors: Record<number, string> = {
                            0: 'FFFFFF', 8: '000000', 9: 'FFFFFF', 10: 'FF0000',
                            11: '00FF00', 12: '0000FF', 13: 'FFFF00', 14: 'FF00FF',
                            15: '00FFFF', 16: '800000', 17: '008000', 18: '000080',
                            19: '808000', 20: '800080', 21: '008080', 22: 'C0C0C0',
                            23: '808080', 24: '9999FF', 25: '993366', 26: 'FFFFCC',
                            27: 'CCFFFF', 28: '660066', 29: 'FF8080', 30: '0066CC',
                            31: 'CCCCFF', 32: '000080', 33: 'FF00FF', 34: 'FFFF00',
                            35: '00FFFF', 36: '800080', 37: '800000', 38: '008080',
                            39: '0000FF', 40: '00CCFF', 41: 'CCFFFF', 42: 'CCFFCC',
                            43: 'FFFF99', 44: '99CCFF', 45: 'FF99CC', 46: 'CC99FF',
                            47: 'FFCC99', 48: '3366FF', 49: '33CCCC', 50: '99CC00',
                            51: 'FFCC00', 52: 'FF9900', 53: 'FF6600', 54: '666699',
                            55: '969696', 56: '003366', 57: '339966', 58: '003300',
                            59: '333300', 60: '993300', 61: '993366', 62: '333399',
                            63: '333333', 64: 'FFFFFF', 65: '000000'
                        };
                        const hex = indexedColors[color.indexed];
                        return hex ? `#${hex}` : undefined;
                    }

                    // Handle RGB/ARGB colors
                    if (color.rgb) {
                        const rgb = color.rgb.length === 8 ? color.rgb.slice(2) : color.rgb;
                        return `#${rgb}`;
                    }

                    // Handle argb format
                    if (color.argb) {
                        const rgb = color.argb.length === 8 ? color.argb.slice(2) : color.argb;
                        return `#${rgb}`;
                    }

                    return undefined;
                };

                // Helper to convert Excel border style
                const toBorderStyle = (borderStyle?: string): number => {
                    const styleMap: Record<string, number> = {
                        thin: 1, hair: 2, dotted: 3, dashed: 4, dashDot: 5,
                        dashDotDot: 6, double: 7, medium: 8, mediumDashed: 9,
                        mediumDashDot: 10, mediumDashDotDot: 11, slantDashDot: 12, thick: 13,
                    };
                    return styleMap[borderStyle || 'thin'] || 1;
                };

                // Convert each sheet to Fortune-sheet format
                const fortuneSheets: SheetData[] = workbook.SheetNames.map((sheetName) => {
                    const worksheet = workbook.Sheets[sheetName];
                    const celldata: CellData[] = [];
                    const config: SheetConfig = {};

                    // Get the range of the worksheet
                    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');

                    // Extract merged cells
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const merges = (worksheet['!merges'] || []) as any[];
                    if (merges.length > 0) {
                        config.merge = {};
                        merges.forEach((merge) => {
                            const key = `${merge.s.r}_${merge.s.c}`;
                            config.merge![key] = {
                                r: merge.s.r,
                                c: merge.s.c,
                                rs: merge.e.r - merge.s.r + 1,
                                cs: merge.e.c - merge.s.c + 1,
                            };
                        });
                    }

                    // Extract column widths
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const cols = (worksheet['!cols'] || []) as any[];
                    if (cols.length > 0) {
                        config.columnlen = {};
                        cols.forEach((col, idx) => {
                            if (col && col.wpx) {
                                config.columnlen![idx] = col.wpx;
                            } else if (col && col.wch) {
                                config.columnlen![idx] = Math.round(col.wch * 7);
                            } else if (col && col.width) {
                                config.columnlen![idx] = Math.round(col.width * 7);
                            }
                        });
                    }

                    // Extract row heights
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const rows = (worksheet['!rows'] || []) as any[];
                    if (rows.length > 0) {
                        config.rowlen = {};
                        rows.forEach((row, idx) => {
                            if (row && row.hpx) {
                                config.rowlen![idx] = row.hpx;
                            } else if (row && row.hpt) {
                                config.rowlen![idx] = Math.round(row.hpt * 1.333);
                            }
                        });
                    }

                    const borderInfo: BorderInfo[] = [];

                    // Debug: Log first cell with style to understand format
                    let loggedStyle = false;

                    // Iterate through all cells
                    for (let row = range.s.r; row <= range.e.r; row++) {
                        for (let col = range.s.c; col <= range.e.c; col++) {
                            const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const cell = worksheet[cellAddress] as any;

                            if (cell) {
                                // Debug: Log first cell with style
                                if (!loggedStyle && cell.s) {
                                    console.log(`[useFortuneSheet] First styled cell ${cellAddress}:`, JSON.stringify(cell, null, 2));
                                    loggedStyle = true;
                                }

                                const cellValue: CellValue = {
                                    v: cell.v ?? undefined,
                                    m: cell.w || String(cell.v ?? ''),
                                };

                                if (cell.f) {
                                    cellValue.f = cell.f;
                                }

                                if (cell.z) {
                                    cellValue.ct = { fa: cell.z, t: cell.t };
                                }

                                // Check if this cell is part of a merge
                                if (config.merge) {
                                    const mergeKey = `${row}_${col}`;
                                    if (config.merge[mergeKey]) {
                                        cellValue.mc = {
                                            r: row,
                                            c: col,
                                            rs: config.merge[mergeKey].rs,
                                            cs: config.merge[mergeKey].cs,
                                        };
                                    } else {
                                        for (const [, merge] of Object.entries(config.merge)) {
                                            if (
                                                row >= merge.r &&
                                                row < merge.r + merge.rs &&
                                                col >= merge.c &&
                                                col < merge.c + merge.cs &&
                                                !(row === merge.r && col === merge.c)
                                            ) {
                                                cellValue.mc = { r: merge.r, c: merge.c };
                                                break;
                                            }
                                        }
                                    }
                                }

                                // Extract styles from cell.s
                                if (cell.s) {
                                    // Background color
                                    if (cell.s.fill) {
                                        const patternType = cell.s.fill.patternType;
                                        const hasFill = patternType
                                            ? !['none', 'gray125'].includes(patternType)
                                            : !!cell.s.fill.fgColor || !!cell.s.fill.bgColor;
                                        if (hasFill) {
                                            let bg: string | undefined;
                                            if (cell.s.fill.fgColor) {
                                                bg = toHexColor(cell.s.fill.fgColor);
                                            }
                                            if (!bg && cell.s.fill.bgColor) {
                                                bg = toHexColor(cell.s.fill.bgColor);
                                            }
                                            if (bg) {
                                                cellValue.bg = bg;
                                            }
                                        }
                                    }

                                    // Font properties
                                    if (cell.s.font) {
                                        if (cell.s.font.color) {
                                            const fc = toHexColor(cell.s.font.color);
                                            if (fc) cellValue.fc = fc;
                                        }
                                        if (cell.s.font.bold) cellValue.bl = 1;
                                        if (cell.s.font.italic) cellValue.it = 1;
                                        if (cell.s.font.strike) cellValue.cl = 1;
                                        if (cell.s.font.underline) cellValue.un = 1;
                                        if (cell.s.font.sz) cellValue.fs = cell.s.font.sz;
                                        if (cell.s.font.name) cellValue.ff = cell.s.font.name;
                                    }

                                    // Alignment
                                    if (cell.s.alignment?.horizontal) {
                                        const hMap: Record<string, number> = { center: 0, left: 1, right: 2 };
                                        cellValue.ht = hMap[cell.s.alignment.horizontal] ?? 1;
                                    }
                                    if (cell.s.alignment?.vertical) {
                                        const vMap: Record<string, number> = { center: 0, top: 1, bottom: 2 };
                                        cellValue.vt = vMap[cell.s.alignment.vertical] ?? 0;
                                    }
                                    if (cell.s.alignment?.wrapText) {
                                        cellValue.tb = '1';
                                    }

                                    // Borders
                                    if (cell.s.border) {
                                        const border = cell.s.border;
                                        const cellBorder: BorderInfo['value'] = {
                                            row_index: row,
                                            col_index: col,
                                        };
                                        let hasBorder = false;

                                        if (border.left) {
                                            cellBorder.l = {
                                                color: toHexColor(border.left.color) || '#000000',
                                                style: toBorderStyle(border.left.style),
                                            };
                                            hasBorder = true;
                                        }
                                        if (border.right) {
                                            cellBorder.r = {
                                                color: toHexColor(border.right.color) || '#000000',
                                                style: toBorderStyle(border.right.style),
                                            };
                                            hasBorder = true;
                                        }
                                        if (border.top) {
                                            cellBorder.t = {
                                                color: toHexColor(border.top.color) || '#000000',
                                                style: toBorderStyle(border.top.style),
                                            };
                                            hasBorder = true;
                                        }
                                        if (border.bottom) {
                                            cellBorder.b = {
                                                color: toHexColor(border.bottom.color) || '#000000',
                                                style: toBorderStyle(border.bottom.style),
                                            };
                                            hasBorder = true;
                                        }

                                        if (hasBorder) {
                                            borderInfo.push({ rangeType: 'cell', value: cellBorder });
                                        }
                                    }
                                }

                                // Log cells with background colors
                                if (cellValue.bg) {
                                    console.log(`[useFortuneSheet] Cell ${cellAddress} bg=${cellValue.bg}`);
                                }

                                celldata.push({ r: row, c: col, v: cellValue });
                            }
                        }
                    }

                    if (borderInfo.length > 0) {
                        config.borderInfo = borderInfo;
                    }

                    console.log(`[useFortuneSheet] Sheet "${sheetName}": ${celldata.length} cells`);

                    return {
                        name: sheetName,
                        celldata,
                        config: Object.keys(config).length > 0 ? config : undefined,
                        row: Math.max(range.e.r + 1, 50),
                        column: Math.max(range.e.c + 1, 26),
                        defaultRowHeight: 20,
                        defaultColWidth: 73,
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
        const cellRef = XLSX.utils.decode_cell(cell.toUpperCase());
        const row = cellRef.r;
        const col = cellRef.c;

        const opts: SetCellValueOptions = typeof options === 'boolean'
            ? { isNumber: options }
            : (options || {});

        let cellVal: string | number = value;
        if (opts.isNumber && typeof value === 'string') {
            const num = parseFloat(value);
            if (!isNaN(num)) cellVal = num;
        }

        const isFormula = opts.isFormula || (typeof value === 'string' && value.startsWith('='));
        const formula = isFormula ? String(value) : undefined;

        setSheets(prevSheets => {
            const newSheets = [...prevSheets];
            const targetSheetIndex = sheetName
                ? newSheets.findIndex(s => s.name === sheetName)
                : 0;

            if (targetSheetIndex === -1) return prevSheets;

            const sheet = { ...newSheets[targetSheetIndex] };
            const celldata = [...(sheet.celldata || [])];

            const existingIndex = celldata.findIndex(c => c.r === row && c.c === col);

            const newCellValue: CellValue = {
                v: isFormula ? undefined : cellVal,
                m: String(cellVal),
                f: formula,
            };

            if (opts.style) {
                Object.assign(newCellValue, opts.style);
            } else if (existingIndex >= 0 && celldata[existingIndex].v) {
                const existingValue = celldata[existingIndex].v;
                if (existingValue) {
                    // Copy style properties from existing cell, preserving formatting
                    if (existingValue.bg !== undefined) newCellValue.bg = existingValue.bg;
                    if (existingValue.fc !== undefined) newCellValue.fc = existingValue.fc;
                    if (existingValue.ff !== undefined) newCellValue.ff = existingValue.ff;
                    if (existingValue.fs !== undefined) newCellValue.fs = existingValue.fs;
                    if (existingValue.bl !== undefined) newCellValue.bl = existingValue.bl;
                    if (existingValue.it !== undefined) newCellValue.it = existingValue.it;
                    if (existingValue.cl !== undefined) newCellValue.cl = existingValue.cl;
                    if (existingValue.un !== undefined) newCellValue.un = existingValue.un;
                    if (existingValue.ht !== undefined) newCellValue.ht = existingValue.ht;
                    if (existingValue.vt !== undefined) newCellValue.vt = existingValue.vt;
                    if (existingValue.tb !== undefined) newCellValue.tb = existingValue.tb;
                    if (existingValue.tr !== undefined) newCellValue.tr = existingValue.tr;
                }
            }

            const newCell: CellData = { r: row, c: col, v: newCellValue };

            if (existingIndex >= 0) {
                celldata[existingIndex] = newCell;
            } else {
                celldata.push(newCell);
            }

            sheet.celldata = celldata;
            newSheets[targetSheetIndex] = sheet;

            console.log(`[useFortuneSheet] setCellValue: ${cell} = ${isFormula ? formula : cellVal}`);
            return newSheets;
        });

        if (workbookRef.current) {
            const targetSheet = sheetName || workbookRef.current.SheetNames[0];
            const worksheet = workbookRef.current.Sheets[targetSheet];
            if (worksheet) {
                if (isFormula && formula) {
                    const cellAddr = cell.toUpperCase();
                    worksheet[cellAddr] = { f: formula.slice(1), t: 'n' };
                } else {
                    XLSX.utils.sheet_add_aoa(worksheet, [[cellVal]], { origin: cell.toUpperCase() });
                }
            }
        }
    }, []);

    return { sheets, isReady, error, workbookRef, setCellValue };
}
