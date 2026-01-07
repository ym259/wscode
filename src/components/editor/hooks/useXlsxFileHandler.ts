/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx-js-style';
import type { SheetData, CellData, CellValue } from './useFortuneSheet';

// Re-export SheetData for backwards compatibility
export type { SheetData };

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
            const XLSX = await import('xlsx-js-style');
            const newWorkbook = XLSX.utils.book_new();

            sheets.forEach(sheet => {
                const worksheet: any = {};
                const celldata = sheet.celldata || [];

                if (celldata.length > 0) {
                    const range = { s: { c: 10000000, r: 10000000 }, e: { c: 0, r: 0 } };

                    celldata.forEach(cell => {
                        const r = cell.r;
                        const c = cell.c;
                        const v = cell.v;

                        if (!v) return; // Skip null cells

                        // Update range
                        if (r < range.s.r) range.s.r = r;
                        if (c < range.s.c) range.s.c = c;
                        if (r > range.e.r) range.e.r = r;
                        if (c > range.e.c) range.e.c = c;

                        const cellRef = XLSX.utils.encode_cell({ r, c });
                        const cellValue = v.v;

                        // Basic cell object
                        const cellObj: any = { v: cellValue };

                        if (typeof cellValue === 'number') {
                            cellObj.t = 'n';
                        } else if (typeof cellValue === 'boolean') {
                            cellObj.t = 'b';
                        } else {
                            cellObj.t = 's';
                        }

                        // Preserve formula
                        if (v.f) {
                            cellObj.f = v.f;
                        }

                        // Preserve styles
                        const style: any = {};
                        if (v.bg) {
                            style.fill = { fgColor: { rgb: v.bg.replace('#', '') } };
                        }
                        if (v.fc || v.bl || v.it || v.fs || v.ff || v.un || v.cl) {
                            style.font = {};
                            if (v.fc) style.font.color = { rgb: v.fc.replace('#', '') };
                            if (v.bl) style.font.bold = true;
                            if (v.it) style.font.italic = true;
                            if (v.un) style.font.underline = true;
                            if (v.cl) style.font.strike = true;
                            if (v.fs) style.font.sz = v.fs;
                            if (v.ff) style.font.name = v.ff;
                        }
                        if (v.ht !== undefined || v.vt !== undefined) {
                            style.alignment = {};
                            if (v.ht !== undefined) {
                                const hMap: Record<number, string> = { 0: 'center', 1: 'left', 2: 'right' };
                                style.alignment.horizontal = hMap[v.ht] || 'left';
                            }
                            if (v.vt !== undefined) {
                                const vMap: Record<number, string> = { 0: 'center', 1: 'top', 2: 'bottom' };
                                style.alignment.vertical = vMap[v.vt] || 'center';
                            }
                        }

                        if (Object.keys(style).length > 0) {
                            cellObj.s = style;
                        }

                        worksheet[cellRef] = cellObj;
                    });

                    worksheet['!ref'] = XLSX.utils.encode_range(range);

                    // Add merged cells config
                    if (sheet.config?.merge) {
                        worksheet['!merges'] = Object.values(sheet.config.merge).map(m => ({
                            s: { r: m.r, c: m.c },
                            e: { r: m.r + m.rs - 1, c: m.c + m.cs - 1 }
                        }));
                    }

                    // Add column widths
                    if (sheet.config?.columnlen) {
                        worksheet['!cols'] = [];
                        for (const [idx, width] of Object.entries(sheet.config.columnlen)) {
                            const colIdx = parseInt(idx, 10);
                            while (worksheet['!cols'].length <= colIdx) {
                                worksheet['!cols'].push({});
                            }
                            worksheet['!cols'][colIdx] = { wpx: width };
                        }
                    }

                    // Add row heights
                    if (sheet.config?.rowlen) {
                        worksheet['!rows'] = [];
                        for (const [idx, height] of Object.entries(sheet.config.rowlen)) {
                            const rowIdx = parseInt(idx, 10);
                            while (worksheet['!rows'].length <= rowIdx) {
                                worksheet['!rows'].push({});
                            }
                            worksheet['!rows'][rowIdx] = { hpx: height };
                        }
                    }
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
