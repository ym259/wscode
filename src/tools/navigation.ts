/* eslint-disable @typescript-eslint/no-explicit-any */
import { ToolDefinition, createTool, ToolContext } from './types';
import { findFileHandle } from './utils';

interface SearchMatch {
    id: string;
    text: string;
    from: number;
    to: number;
}

export const getNavigationTools = (context: ToolContext): ToolDefinition[] => {
    const { workspaceFiles, activeFilePath, activeFileHandle, superdoc } = context;

    return [
        createTool(
            'keywordSearch',
            'Search for text using exact match or regex. Use this for finding specific strings like "Section 1.2" or regex patterns. Faster than searchDocument but requires exact phrasing.',
            {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'The text to search for. Can be plain text or a regex pattern (e.g., "section \\d+" for regex).'
                    },
                    isRegex: {
                        type: 'boolean',
                        description: 'If true, treat the query as a regular expression. Default: false.'
                    },
                    caseInsensitive: {
                        type: 'boolean',
                        description: 'If true, perform case-insensitive search. Only applies to regex. Default: true.'
                    },
                    goToResult: {
                        type: 'integer',
                        description: 'Optional: Navigate to the Nth result (0-indexed). This will scroll the document to show that match.'
                    }
                },
                required: ['query'],
                additionalProperties: false
            },
            async ({ query, isRegex, caseInsensitive, goToResult }: {
                query: string;
                isRegex?: boolean;
                caseInsensitive?: boolean;
                goToResult?: number;
            }) => {
                if (!superdoc) {
                    return 'No document is currently open. Please open a document first.';
                }

                if (!query || query.trim() === '') {
                    return 'Search query cannot be empty.';
                }

                try {
                    let searchPattern: string | RegExp = query;

                    if (isRegex) {
                        const flags = caseInsensitive !== false ? 'gi' : 'g';
                        try {
                            searchPattern = new RegExp(query, flags);
                        } catch (regexError) {
                            return `Invalid regex pattern: ${regexError instanceof Error ? regexError.message : 'Unknown error'}`;
                        }
                    }

                    // Check if superdoc has search method (SuperDoc has it, CustomDocEditor doesn't)
                    if (typeof superdoc?.search === 'function') {
                        const results: SearchMatch[] = superdoc.search(searchPattern);

                        if (!results || results.length === 0) {
                            return `No matches found for "${query}".`;
                        }

                        // Optionally navigate to a specific result
                        if (goToResult !== undefined && goToResult >= 0 && goToResult < results.length) {
                            superdoc.goToSearchResult(results[goToResult]);
                        }

                        // Format results for the agent
                        const formattedResults = results.slice(0, 20).map((match, index) => ({
                            index,
                            text: match.text.length > 100 ? match.text.substring(0, 100) + '...' : match.text,
                            position: { from: match.from, to: match.to }
                        }));

                        let response = `Found ${results.length} match${results.length === 1 ? '' : 'es'} for "${query}":\n\n`;
                        formattedResults.forEach(result => {
                            response += `[${result.index}] "${result.text}" (position: ${result.position.from}-${result.position.to})\n`;
                        });

                        if (results.length > 20) {
                            response += `\n... and ${results.length - 20} more matches.`;
                        }

                        if (goToResult !== undefined) {
                            response += `\n\nNavigated to result #${goToResult}.`;
                        } else {
                            response += '\n\nTip: Use goToResult parameter to navigate to a specific match.';
                        }

                        return response;
                    } else {
                        // Fallback for CustomDocEditor: use TipTap editor with full regex support
                        const { getEditor } = context;
                        const editor = getEditor?.();

                        if (!editor?.state?.doc) {
                            return `Search is not available in this editor. Use readDocument to read the content and search manually.`;
                        }

                        // Get text content from the document
                        const textContent = editor.state.doc.textContent || '';

                        // Build search pattern - supports both regex and plain text
                        let regex: RegExp;
                        if (isRegex && searchPattern instanceof RegExp) {
                            regex = searchPattern;
                        } else {
                            // Escape special regex characters for literal search
                            const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                            const flags = caseInsensitive !== false ? 'gi' : 'g';
                            regex = new RegExp(escaped, flags);
                        }

                        // Find all matches with regex
                        const matches: Array<{ index: number; text: string; context: string; from: number; to: number }> = [];
                        let match: RegExpExecArray | null;

                        while ((match = regex.exec(textContent)) !== null) {
                            const foundAt = match.index;
                            const matchedText = match[0];

                            // Get context around the match (50 chars each side)
                            const contextStart = Math.max(0, foundAt - 50);
                            const contextEnd = Math.min(textContent.length, foundAt + matchedText.length + 50);
                            const context = textContent.slice(contextStart, contextEnd);

                            matches.push({
                                index: matches.length,
                                text: matchedText,
                                context: (contextStart > 0 ? '...' : '') + context + (contextEnd < textContent.length ? '...' : ''),
                                from: foundAt,
                                to: foundAt + matchedText.length
                            });

                            // Prevent infinite loops on zero-width matches
                            if (matchedText.length === 0) {
                                regex.lastIndex++;
                            }

                            // Limit results - increased for comprehensive contract review
                            if (matches.length >= 200) break;
                        }

                        if (matches.length === 0) {
                            return `No matches found for "${query}"${isRegex ? ' (regex)' : ''}.`;
                        }

                        // Format results similar to SuperDoc
                        const displayMatches = matches.slice(0, 20);
                        let response = `Found ${matches.length}${matches.length >= 50 ? '+' : ''} match${matches.length === 1 ? '' : 'es'} for "${query}"${isRegex ? ' (regex)' : ''}:\n\n`;

                        displayMatches.forEach(m => {
                            response += `[${m.index}] "${m.text}" at ${m.from}-${m.to}\n    Context: "${m.context}"\n`;
                        });

                        if (matches.length > 20) {
                            response += `\n... and ${matches.length - 20} more matches.`;
                        }

                        response += '\n\nTip: Use isRegex: true for regex patterns like "section \\\\d+" or "第\\\\d+条"';

                        return response;
                    }
                } catch (error) {
                    console.error('[searchDocument] Error:', error);
                    return `Error searching document: ${error instanceof Error ? error.message : 'Unknown error'}`;
                }
            }
        ),
        createTool(
            'readFile',
            'Read the content of a file from the workspace by its path. Use this to access files mentioned by the user with @. If path is omitted, reads the active file. For xlsx files, defaults to first sheet only - use sheets parameter to read specific sheet(s). For large documents, content is paginated.',
            {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'The file path as shown in the workspace. Optional if a file is currently open.' },
                    sheets: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'For xlsx files: sheet name(s) to read. Defaults to first sheet only. Use listSpreadsheetSheets to see available sheets.'
                    },
                    startPage: { type: 'integer', description: 'Starting page number (1-indexed, default: 1)' },
                    endPage: { type: 'integer', description: 'Ending page number (inclusive, default: 5). Max 5 pages per request.' }
                },
                required: [],
                additionalProperties: false
            },
            async ({ path, sheets, startPage, endPage }: { path?: string, sheets?: string[], startPage?: number, endPage?: number }) => {
                const CHARS_PER_PAGE = 3000;
                const MAX_PAGES_PER_REQUEST = 5;
                const DEFAULT_END_PAGE = 5;

                const targetPath = path || activeFilePath;

                if (!targetPath) {
                    return 'Error: No path provided and no active file found. Please specify the file path.';
                }

                // Normalize pagination params
                const start = Math.max(1, startPage || 1);
                const requestedEnd = endPage || DEFAULT_END_PAGE;
                const end = Math.min(requestedEnd, start + MAX_PAGES_PER_REQUEST - 1);

                // Check if this is the active file currently open in SuperDoc
                // Note: normalized path check might be needed if format differs
                const isActiveFile = activeFilePath && targetPath === activeFilePath;

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

                // For non-active files (or if SuperDoc fails), read from workspace
                if (!workspaceFiles || workspaceFiles.length === 0) {
                    return 'No workspace files available. Please open a folder first.';
                }

                let handle: any = null;

                // Use active handle if available and path matches active file
                if (activeFileHandle && (targetPath === activeFilePath || !path)) {
                    handle = activeFileHandle;
                } else {
                    handle = findFileHandle(workspaceFiles, targetPath);
                }

                if (!handle) {
                    return `File not found: ${targetPath}. Make sure the path matches exactly as shown in the workspace.`;
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
                    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
                        // Use SheetJS to parse spreadsheet
                        try {
                            const XLSX = await import('xlsx-js-style');
                            const arrayBuffer = await file.arrayBuffer();
                            const workbook = XLSX.read(arrayBuffer, { type: 'array' });

                            // Safeguards to prevent token overload
                            const MAX_ROWS = 200;
                            const MAX_COLS = 50;

                            // Determine which sheets to read
                            // If sheets param provided, use those; otherwise default to first sheet only
                            const sheetsToRead = sheets && sheets.length > 0
                                ? sheets.filter(s => workbook.SheetNames.includes(s))
                                : [workbook.SheetNames[0]];

                            if (sheets && sheets.length > 0 && sheetsToRead.length === 0) {
                                return `Error: None of the specified sheets (${sheets.join(', ')}) were found. Available sheets: ${workbook.SheetNames.join(', ')}`;
                            }

                            // Convert selected sheets to readable text
                            const sheetsContent: string[] = [];
                            for (const sheetName of sheetsToRead) {
                                const worksheet = workbook.Sheets[sheetName];

                                // Get the actual range of data
                                const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
                                const actualRows = range.e.r - range.s.r + 1;
                                const actualCols = range.e.c - range.s.c + 1;

                                // Limit the range if needed
                                const limitedRange = {
                                    s: { r: range.s.r, c: range.s.c },
                                    e: {
                                        r: Math.min(range.e.r, range.s.r + MAX_ROWS - 1),
                                        c: Math.min(range.e.c, range.s.c + MAX_COLS - 1)
                                    }
                                };

                                const wasTruncated = actualRows > MAX_ROWS || actualCols > MAX_COLS;

                                // Temporarily limit worksheet range for conversion
                                const originalRef = worksheet['!ref'];
                                if (wasTruncated) {
                                    worksheet['!ref'] = XLSX.utils.encode_range(limitedRange);
                                }

                                // Convert to CSV with options to minimize output
                                const csv = XLSX.utils.sheet_to_csv(worksheet, {
                                    blankrows: false,  // Skip blank rows
                                    skipHidden: true   // Skip hidden rows/columns
                                });

                                // Restore original range
                                if (wasTruncated && originalRef) {
                                    worksheet['!ref'] = originalRef;
                                }

                                // Trim trailing empty columns from each row
                                const trimmedCsv = csv
                                    .split('\n')
                                    .map(row => row.replace(/,+$/, '')) // Remove trailing commas
                                    .filter(row => row.trim() !== '')   // Remove empty rows
                                    .join('\n');

                                if (trimmedCsv.trim()) {
                                    let sheetHeader = `## Sheet: ${sheetName}`;
                                    if (wasTruncated) {
                                        sheetHeader += ` (showing ${Math.min(actualRows, MAX_ROWS)}/${actualRows} rows, ${Math.min(actualCols, MAX_COLS)}/${actualCols} cols)`;
                                    }
                                    sheetsContent.push(`${sheetHeader}\n\n${trimmedCsv}`);
                                }
                            }

                            // Add note about other available sheets if only reading subset
                            const otherSheets = workbook.SheetNames.filter(s => !sheetsToRead.includes(s));
                            content = sheetsContent.length > 0
                                ? sheetsContent.join('\n\n---\n\n')
                                : '[Empty spreadsheet - no data found]';

                            if (otherSheets.length > 0) {
                                content += `\n\n---\n[Other available sheets: ${otherSheets.join(', ')}. Use sheets parameter to read them.]`;
                            }
                        } catch (xlsxError) {
                            console.error('[readFile] XLSX extraction failed:', xlsxError);
                            content = `[Error extracting xlsx content: ${xlsxError instanceof Error ? xlsxError.message : 'Unknown error'}]`;
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
        ),

        createTool(
            'openFile',
            'Open a file in the editor, making it the active file. Use this when you need to edit a file that is not currently active. After opening, you will have access to write tools for that file type. IMPORTANT: After calling this, complete your current turn and the new tools will be available in the next turn.',
            {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'Path to the file to open (as shown in workspace).'
                    }
                },
                required: ['path'],
                additionalProperties: false
            },
            async ({ path }: { path: string }) => {
                const { openFileInEditor } = context;

                if (!path) {
                    return 'Error: path is required.';
                }

                if (!openFileInEditor) {
                    return 'Error: openFile capability not available. This may be a configuration issue.';
                }

                try {
                    const success = await openFileInEditor(path);
                    if (success) {
                        const fileType = path.toLowerCase().endsWith('.xlsx') ? 'xlsx'
                            : path.toLowerCase().endsWith('.docx') ? 'docx'
                                : 'other';
                        return `Successfully opened "${path}". The file is now active. ${fileType === 'docx' ? 'DOCX write tools (insertTable, literalReplace, etc.)' : fileType === 'xlsx' ? 'XLSX write tools (editSpreadsheet, insertRow, etc.)' : 'Write tools'} are now available for your next action.`;
                    } else {
                        return `Failed to open "${path}". The file may not exist in the workspace.`;
                    }
                } catch (error) {
                    return `Error opening file: ${error instanceof Error ? error.message : 'Unknown error'}`;
                }
            }
        )
    ];
};
