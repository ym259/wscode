/* eslint-disable @typescript-eslint/no-unused-vars, prefer-const */
import { ToolDefinition, createTool, ToolContext } from '../types';

// Page size presets in twips (1 inch = 1440 twips, 1 mm ≈ 56.69 twips)
const PAGE_SIZE_PRESETS: Record<string, { width: number; height: number; description: string }> = {
    'A4': { width: 11906, height: 16838, description: '210mm × 297mm' },
    'A4_LANDSCAPE': { width: 16838, height: 11906, description: '297mm × 210mm' },
    'B5': { width: 10319, height: 14571, description: '182mm × 257mm' },
    'B5_LANDSCAPE': { width: 14571, height: 10319, description: '257mm × 182mm' },
    'LETTER': { width: 12240, height: 15840, description: '8.5in × 11in' },
    'LETTER_LANDSCAPE': { width: 15840, height: 12240, description: '11in × 8.5in' },
    'LEGAL': { width: 12240, height: 20160, description: '8.5in × 14in' },
};

// Common Japanese legal margin presets (in twips)
const MARGIN_PRESETS: Record<string, { top: number; right: number; bottom: number; left: number; description: string }> = {
    // 日本の裁判所提出書面の一般的な書式 (上下左右 25mm)
    'JP_COURT_25MM': { top: 1417, right: 1417, bottom: 1417, left: 1417, description: '25mm all sides (Japanese court standard)' },
    // 上30mm、左右・下20mm
    'JP_COURT_30_20': { top: 1701, right: 1134, bottom: 1134, left: 1134, description: 'Top 30mm, others 20mm' },
    // Word デフォルト (上下 25.4mm, 左右 31.75mm)
    'WORD_DEFAULT': { top: 1440, right: 1800, bottom: 1440, left: 1800, description: '1in top/bottom, 1.25in left/right' },
    // 狭い余白 (上下左右 12.7mm)
    'NARROW': { top: 720, right: 720, bottom: 720, left: 720, description: '0.5in all sides' },
    // 広い余白 (上下25.4mm、左右50.8mm)
    'WIDE': { top: 1440, right: 2880, bottom: 1440, left: 2880, description: '1in top/bottom, 2in left/right' },
};

// Helper: Convert mm to twips
const mmToTwips = (mm: number): number => Math.round(mm * 56.69);

// Helper: Convert inches to twips
const inchesToTwips = (inches: number): number => Math.round(inches * 1440);

export const getPageLayoutTools = (context: ToolContext): ToolDefinition[] => {
    return [
        createTool(
            'setPageLayout',
            'Set page size and margins for the document. Supports presets for Japanese legal submissions.',
            {
                type: 'object',
                properties: {
                    pageSizePreset: {
                        type: 'string',
                        enum: Object.keys(PAGE_SIZE_PRESETS),
                        description: 'Page size preset: A4, A4_LANDSCAPE, B5, B5_LANDSCAPE, LETTER, LETTER_LANDSCAPE, LEGAL'
                    },
                    marginPreset: {
                        type: 'string',
                        enum: Object.keys(MARGIN_PRESETS),
                        description: 'Margin preset: JP_COURT_25MM (Japanese court 25mm), JP_COURT_30_20, WORD_DEFAULT, NARROW, WIDE'
                    },
                    customPageSize: {
                        type: 'object',
                        description: 'Custom page size in mm. Overrides pageSizePreset if provided.',
                        properties: {
                            widthMm: { type: 'number', description: 'Width in millimeters' },
                            heightMm: { type: 'number', description: 'Height in millimeters' }
                        }
                    },
                    customMargins: {
                        type: 'object',
                        description: 'Custom margins in mm. Overrides marginPreset if provided.',
                        properties: {
                            topMm: { type: 'number', description: 'Top margin in mm' },
                            rightMm: { type: 'number', description: 'Right margin in mm' },
                            bottomMm: { type: 'number', description: 'Bottom margin in mm' },
                            leftMm: { type: 'number', description: 'Left margin in mm' }
                        }
                    }
                },
                additionalProperties: false
            },
            async (args: {
                pageSizePreset?: string;
                marginPreset?: string;
                customPageSize?: { widthMm?: number; heightMm?: number };
                customMargins?: { topMm?: number; rightMm?: number; bottomMm?: number; leftMm?: number };
            }) => {
                const { getCustomEditorRef } = context;
                const editorRef = getCustomEditorRef?.();

                if (!editorRef?.current?.setPageLayout) {
                    return 'Error: setPageLayout is not available. This feature requires the CustomDocEditor.';
                }

                const updates: {
                    pageSize?: { width: number; height: number };
                    pageMargins?: { top: number; right: number; bottom: number; left: number };
                } = {};

                let appliedSettings: string[] = [];

                // Handle page size
                if (args.customPageSize?.widthMm && args.customPageSize?.heightMm) {
                    updates.pageSize = {
                        width: mmToTwips(args.customPageSize.widthMm),
                        height: mmToTwips(args.customPageSize.heightMm)
                    };
                    appliedSettings.push(`Page size: ${args.customPageSize.widthMm}mm × ${args.customPageSize.heightMm}mm (custom)`);
                } else if (args.pageSizePreset && PAGE_SIZE_PRESETS[args.pageSizePreset]) {
                    const preset = PAGE_SIZE_PRESETS[args.pageSizePreset];
                    updates.pageSize = { width: preset.width, height: preset.height };
                    appliedSettings.push(`Page size: ${args.pageSizePreset} (${preset.description})`);
                }

                // Handle margins
                if (args.customMargins) {
                    const margins = args.customMargins;
                    updates.pageMargins = {
                        top: margins.topMm !== undefined ? mmToTwips(margins.topMm) : 1440,
                        right: margins.rightMm !== undefined ? mmToTwips(margins.rightMm) : 1440,
                        bottom: margins.bottomMm !== undefined ? mmToTwips(margins.bottomMm) : 1440,
                        left: margins.leftMm !== undefined ? mmToTwips(margins.leftMm) : 1440,
                    };
                    appliedSettings.push(`Margins: top=${margins.topMm ?? 25.4}mm, right=${margins.rightMm ?? 25.4}mm, bottom=${margins.bottomMm ?? 25.4}mm, left=${margins.leftMm ?? 25.4}mm (custom)`);
                } else if (args.marginPreset && MARGIN_PRESETS[args.marginPreset]) {
                    const preset = MARGIN_PRESETS[args.marginPreset];
                    updates.pageMargins = {
                        top: preset.top,
                        right: preset.right,
                        bottom: preset.bottom,
                        left: preset.left
                    };
                    appliedSettings.push(`Margins: ${args.marginPreset} (${preset.description})`);
                }

                if (Object.keys(updates).length === 0) {
                    return `No changes applied. Available presets:
                    
**Page Sizes**: ${Object.entries(PAGE_SIZE_PRESETS).map(([k, v]) => `${k} (${v.description})`).join(', ')}

**Margin Presets**: ${Object.entries(MARGIN_PRESETS).map(([k, v]) => `${k} (${v.description})`).join(', ')}

Example: setPageLayout({ pageSizePreset: "A4", marginPreset: "JP_COURT_25MM" })`;
                }

                editorRef.current.setPageLayout(updates);

                return `Page layout updated:\n${appliedSettings.map(s => `- ${s}`).join('\n')}\n\nThe document preview has been updated. Export to save these settings to the DOCX file.`;
            }
        ),
        createTool(
            'getPageLayout',
            'Get the current page size and margins of the document.',
            {
                type: 'object',
                properties: {},
                additionalProperties: false
            },
            async () => {
                const { getCustomEditorRef } = context;
                const editorRef = getCustomEditorRef?.();

                if (!editorRef?.current?.getDocAttrs) {
                    return 'Error: getDocAttrs is not available. This feature requires the CustomDocEditor.';
                }

                const docAttrs = editorRef.current.getDocAttrs();

                if (!docAttrs) {
                    return 'No document attributes available. The document may not be loaded yet.';
                }

                const pageSize = docAttrs.pageSize;
                const pageMargins = docAttrs.pageMargins;

                // Convert twips to mm for display
                const twipsToMm = (twips: number) => (twips / 56.69).toFixed(1);
                const twipsToInches = (twips: number) => (twips / 1440).toFixed(2);

                let result = '## Current Page Layout\n\n';

                if (pageSize) {
                    const widthTwips = pageSize['w:w'] || 12240;
                    const heightTwips = pageSize['w:h'] || 15840;
                    result += `### Page Size\n`;
                    result += `- Width: ${twipsToMm(widthTwips)}mm (${twipsToInches(widthTwips)}in)\n`;
                    result += `- Height: ${twipsToMm(heightTwips)}mm (${twipsToInches(heightTwips)}in)\n`;

                    // Detect preset
                    const matchedPreset = Object.entries(PAGE_SIZE_PRESETS).find(
                        ([_, v]) => Math.abs(v.width - widthTwips) < 50 && Math.abs(v.height - heightTwips) < 50
                    );
                    if (matchedPreset) {
                        result += `- Detected preset: **${matchedPreset[0]}** (${matchedPreset[1].description})\n`;
                    }
                } else {
                    result += '### Page Size\nUsing default (US Letter)\n';
                }

                result += '\n';

                if (pageMargins) {
                    result += `### Page Margins\n`;
                    result += `- Top: ${twipsToMm(pageMargins['w:top'] || 1440)}mm\n`;
                    result += `- Right: ${twipsToMm(pageMargins['w:right'] || 1440)}mm\n`;
                    result += `- Bottom: ${twipsToMm(pageMargins['w:bottom'] || 1440)}mm\n`;
                    result += `- Left: ${twipsToMm(pageMargins['w:left'] || 1440)}mm\n`;
                } else {
                    result += '### Page Margins\nUsing default (1 inch all sides)\n';
                }

                return result;
            }
        )
    ];
};
