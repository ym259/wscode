import { ToolDefinition, createTool, ToolContext } from './types';
import { findFileHandle } from './utils';

export const getNavigationTools = (context: ToolContext): ToolDefinition[] => {
    const { workspaceFiles, activeFilePath, superdoc } = context;

    return [
        createTool(
            'readFile',
            'Read the content of a file from the workspace by its path. Use this to access files mentioned by the user with @. For large documents, content is paginated - use startPage/endPage to read specific sections.',
            {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'The file path as shown in the workspace (e.g., "folder/document.docx")' },
                    startPage: { type: 'integer', description: 'Starting page number (1-indexed, default: 1)' },
                    endPage: { type: 'integer', description: 'Ending page number (inclusive, default: 5). Max 5 pages per request.' }
                },
                required: ['path'],
                additionalProperties: false
            },
            async ({ path, startPage, endPage }: { path: string, startPage?: number, endPage?: number }) => {
                const CHARS_PER_PAGE = 3000; // Approximate chars per page for Word docs
                const MAX_PAGES_PER_REQUEST = 5;
                const DEFAULT_END_PAGE = 5;

                // Normalize pagination params
                const start = Math.max(1, startPage || 1);
                const requestedEnd = endPage || DEFAULT_END_PAGE;
                const end = Math.min(requestedEnd, start + MAX_PAGES_PER_REQUEST - 1);

                // Check if this is the active file currently open in SuperDoc
                const isActiveFile = activeFilePath && path === activeFilePath;

                if (isActiveFile && superdoc) {
                    // Use SuperDoc's getHTML() for the active document - preserves structure
                    try {
                        const htmlArray = superdoc.getHTML();
                        const content = Array.isArray(htmlArray) ? htmlArray.join('\n') : String(htmlArray);

                        const totalPages = Math.ceil(content.length / CHARS_PER_PAGE);
                        const startChar = (start - 1) * CHARS_PER_PAGE;
                        const endChar = Math.min(end, totalPages) * CHARS_PER_PAGE;
                        const pageContent = content.slice(startChar, endChar);
                        const actualEndPage = Math.min(end, totalPages);

                        let result = `[Active Document - Pages ${start}-${actualEndPage} of ${totalPages}]\n\n${pageContent}`;
                        if (actualEndPage < totalPages) {
                            result += `\n\n[More pages available. Use startPage: ${actualEndPage + 1} to continue reading.]`;
                        }
                        return result;
                    } catch (err) {
                        console.error('[readFile] SuperDoc getHTML failed:', err);
                        // Fall through to file-based reading
                    }
                }

                // For non-active files, read from workspace
                if (!workspaceFiles || workspaceFiles.length === 0) {
                    return 'No workspace files available. Please open a folder first.';
                }

                const handle = findFileHandle(workspaceFiles, path);
                if (!handle) {
                    return `File not found: ${path}. Make sure the path matches exactly as shown in the workspace.`;
                }

                try {
                    // Request permission if needed
                    const permission = await handle.queryPermission({ mode: 'read' });
                    if (permission !== 'granted') {
                        const requestResult = await handle.requestPermission({ mode: 'read' });
                        if (requestResult !== 'granted') {
                            return `Permission denied to read: ${path}`;
                        }
                    }

                    const file = await handle.getFile();
                    const fileName = file.name.toLowerCase();
                    let content = '';

                    if (fileName.endsWith('.docx')) {
                        // Use mammoth to convert to HTML (preserves tables)
                        try {
                            const mammoth = await import('mammoth');
                            const arrayBuffer = await file.arrayBuffer();
                            const result = await mammoth.convertToHtml({ arrayBuffer });
                            content = result.value || '';
                        } catch (mammothError) {
                            console.error('[readFile] Mammoth extraction failed:', mammothError);
                            content = `[Error extracting docx content: ${mammothError instanceof Error ? mammothError.message : 'Unknown error'}]`;
                        }
                    } else if (fileName.endsWith('.pdf')) {
                        // PDF text extraction placeholder
                        content = `[PDF file: ${file.name}] - PDF text extraction is not yet implemented. File size: ${file.size} bytes.`;
                    } else {
                        // For other text files
                        content = await file.text();
                    }

                    // Apply pagination
                    const totalPages = Math.ceil(content.length / CHARS_PER_PAGE);
                    const startChar = (start - 1) * CHARS_PER_PAGE;
                    const endChar = Math.min(end, totalPages) * CHARS_PER_PAGE;
                    const pageContent = content.slice(startChar, endChar);
                    const actualEndPage = Math.min(end, totalPages);

                    let result = `[Pages ${start}-${actualEndPage} of ${totalPages}]\n\n${pageContent}`;
                    if (actualEndPage < totalPages) {
                        result += `\n\n[More pages available. Use startPage: ${actualEndPage + 1} to continue reading.]`;
                    }
                    return result;
                } catch (error) {
                    return `Error reading file: ${error instanceof Error ? error.message : 'Unknown error'}`;
                }
            }
        )
    ];
};
