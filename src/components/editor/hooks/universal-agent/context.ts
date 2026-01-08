/* eslint-disable @typescript-eslint/no-explicit-any */
import { AIActions } from '@superdoc-dev/ai';
import { ToolContext } from '@/tools';
import { FileType, UniversalAgentConfig } from './types';

/**
 * Detect file type from path
 */
export function detectFileType(path?: string): FileType {
    if (!path) return null;
    const lower = path.toLowerCase();
    if (lower.endsWith('.docx') || lower.endsWith('.doc')) return 'docx';
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'xlsx';
    if (lower.endsWith('.pdf')) return 'pdf';
    if (lower.endsWith('.txt') || lower.endsWith('.md')) return 'txt';
    return null;
}

/**
 * Build tool context for the agent
 */
export function buildToolContext(
    config: UniversalAgentConfig,
    aiActions?: AIActions | null
): ToolContext {
    const { superdocRef, customEditorRef, workspaceFiles, libraryItems, activeFilePath, activeFileHandle, setCellValue, openFileInEditor, addFileToWorkspace } = config;

    // Helper to get TipTap editor from SuperDoc or CustomDocEditor
    const getEditor = () => {
        // Try CustomDocEditor first (if provided)
        if (customEditorRef?.current) {
            const ce = customEditorRef.current;
            return ce.editor || ce.getEditor?.() || ce;
        }
        // Fall back to SuperDoc
        if (!superdocRef?.current) return null;
        const sd = superdocRef.current as any;
        return sd.activeEditor || sd.editor || sd.getEditor?.() || sd._editor;
    };

    // Helper to get AIActions methods (only available with SuperDoc)
    const getActionMethods = () => aiActions ? (aiActions as any).action : ({} as any);

    return {
        getActionMethods,
        getEditor,
        workspaceFiles,
        libraryItems,
        activeFilePath,
        activeFileHandle,
        // Expose superdoc or custom editor as 'superdoc' for compatibility
        superdoc: superdocRef?.current || customEditorRef?.current || ({} as any),
        setCellValue,
        openFileInEditor,
        addFileToWorkspace,
        openaiConfig: {
            apiKey: 'dummy',
            baseURL: window.location.origin + '/api/ai',
            dangerouslyAllowBrowser: true
        },
        getCustomEditorRef: () => customEditorRef || null,
        addLoadedPdfFile: config.addLoadedPdfFile,
        addLoadedImageFile: config.addLoadedImageFile,
        getWorkbook: config.getWorkbook
    };
}
