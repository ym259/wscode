import { ToolDefinition, createTool, ToolContext } from './types';
import { findFileHandle } from './utils';

/** Info about a loaded PDF file */
export interface LoadedPdfFile {
    file_id: string;
    filename: string;
}

/**
 * Get PDF-specific tools
 * 
 * These tools allow loading PDFs into the AI context for analysis.
 */
export const getPdfTools = (context: ToolContext): ToolDefinition[] => {
    const { workspaceFiles, addLoadedPdfFile } = context;

    return [
        createTool(
            'loadPdf',
            'Load a PDF file into your AI context for analysis. After loading, you can reason about the PDF content directly. The PDF will be available in your next response. Use this when you need to analyze, summarize, or extract information from a PDF document.',
            {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'Path to the PDF file in the workspace'
                    }
                },
                required: ['path'],
                additionalProperties: false
            },
            async ({ path }: { path: string }) => {
                if (!path) {
                    return 'Error: path is required.';
                }

                // Validate it's a PDF
                if (!path.toLowerCase().endsWith('.pdf')) {
                    return `Error: File "${path}" is not a PDF. Use readFile for other file types.`;
                }

                // Find the file in workspace
                if (!workspaceFiles || workspaceFiles.length === 0) {
                    return 'Error: No workspace files available. Please open a folder first.';
                }

                // Try to use activeFileHandle first if path matches the active file (avoids path issues)
                const { activeFileHandle, activeFilePath } = context;
                let handle: FileSystemFileHandle | null = null;

                if (activeFileHandle && activeFilePath) {
                    // Check if the provided path matches the active file (by name or exact path)
                    const activeFileName = activeFilePath.split('/').pop()?.toLowerCase();
                    const requestedFileName = path.split('/').pop()?.toLowerCase();

                    if (activeFileName === requestedFileName ||
                        activeFilePath.toLowerCase() === path.toLowerCase() ||
                        activeFilePath.toLowerCase().endsWith(path.toLowerCase())) {
                        handle = activeFileHandle;
                        console.log('[loadPdf] Using activeFileHandle for:', activeFilePath);
                    }
                }

                // Fall back to workspace search if activeFileHandle didn't match
                if (!handle) {
                    handle = findFileHandle(workspaceFiles, path);
                }

                if (!handle) {
                    return `Error: PDF file not found: ${path}. Make sure the path matches exactly as shown in the workspace.`;
                }

                try {
                    // Request permission if needed
                    const permission = await handle.queryPermission({ mode: 'read' });
                    if (permission !== 'granted') {
                        const requestResult = await handle.requestPermission({ mode: 'read' });
                        if (requestResult !== 'granted') {
                            return `Error: Permission denied to read: ${path}`;
                        }
                    }

                    // Read file as ArrayBuffer then convert to base64
                    const file = await handle.getFile();
                    const arrayBuffer = await file.arrayBuffer();

                    // Convert to base64 (browser-compatible)
                    const bytes = new Uint8Array(arrayBuffer);
                    let binary = '';
                    for (let i = 0; i < bytes.byteLength; i++) {
                        binary += String.fromCharCode(bytes[i]);
                    }
                    const base64 = btoa(binary);

                    // Upload to OpenAI via API route
                    const response = await fetch('/api/pdf/upload', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ pdfBase64: base64, filename: file.name })
                    });

                    if (!response.ok) {
                        const errorText = await response.text();
                        return `Error uploading PDF: ${errorText}`;
                    }

                    const { file_id, metadata } = await response.json();

                    // Register file_id for injection into next message
                    if (addLoadedPdfFile) {
                        addLoadedPdfFile({ file_id, filename: file.name });
                    }

                    // Return metadata to agent
                    const sizeKB = (metadata.bytes / 1024).toFixed(1);
                    return `PDF loaded successfully: "${file.name}" (${sizeKB} KB). File ID: ${file_id}. The PDF content is now available in your context. Analyze it in your next response.`;
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    return `Error loading PDF: ${message}`;
                }
            }
        )
    ];
};
