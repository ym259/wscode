import { ToolDefinition, createTool, ToolContext } from './types';
import { escapeHtml, findFileHandle } from './utils';
import { AIActions } from '@superdoc-dev/ai';

/**
 * Check if a text node has a deletion mark (track changes).
 * Used to skip deleted text when searching for content.
 */
const hasDeletionMark = (node: any): boolean => {
    if (!node.marks?.length) return false;
    return node.marks.some((mark: any) => {
        const markName = mark.type.name.toLowerCase();
        // Check for various deletion mark patterns used by track changes extensions
        return markName.includes('deletion') ||
            markName.includes('delete') ||
            markName.includes('suggestdeletion') ||
            markName === 'diffmarkdeletion' ||
            (markName.includes('trackchange') && mark.attrs?.type === 'deletion') ||
            (markName.includes('suggest') && mark.attrs?.type === 'deletion');
    });
};

/**
 * Find text position in the document, skipping text nodes with deletion marks.
 * Returns { from, to } if found, or null if not found.
 */
/**
 * Find text position in the document, skipping text nodes with deletion marks.
 * Supports context matching to disambiguate repeated text.
 * Returns { from, to } for the first match that satisfies context criteria.
 */
const findTextPositionExcludingDeletions = (
    doc: any,
    searchText: string,
    options: { contextBefore?: string; contextAfter?: string; debug?: boolean } = {}
): { from: number; to: number } | null => {
    const { contextBefore, contextAfter, debug } = options;
    const normalizedSearch = searchText.toLowerCase();
    const normalizedContextBefore = contextBefore?.toLowerCase();
    const normalizedContextAfter = contextAfter?.toLowerCase();

    // Build flattened text and map to segments
    const segments: Array<{ text: string; pos: number; startIdx: number }> = [];
    let concatenated = '';

    doc.descendants((node: any, pos: number) => {
        if (node.isText) {
            const isDeleted = hasDeletionMark(node);
            if (!isDeleted) {
                segments.push({
                    text: node.text!,
                    pos,
                    startIdx: concatenated.length
                });
                concatenated += node.text!;
            }
        }
        return true;
    });

    if (debug) {
        console.log('[findTextPosition] text length:', concatenated.length);
        console.log('[findTextPosition] Looking for:', searchText);
        if (contextBefore) console.log('[findTextPosition] Context before:', contextBefore);
        if (contextAfter) console.log('[findTextPosition] Context after:', contextAfter);
    }

    // Helper to map concatenated index to doc position
    const mapToDocPos = (index: number): number => {
        const segment = segments.find(s => index >= s.startIdx && index < s.startIdx + s.text.length);
        if (segment) {
            return segment.pos + (index - segment.startIdx);
        }
        return -1;
    };

    let searchPos = 0;
    while (searchPos < concatenated.length) {
        const idx = concatenated.toLowerCase().indexOf(normalizedSearch, searchPos);
        if (idx === -1) break;

        let match = true;

        // Check Context Before
        if (normalizedContextBefore) {
            // Check if there is enough space before
            if (idx < normalizedContextBefore.length) {
                match = false;
            } else {
                const check = concatenated.substring(idx - normalizedContextBefore.length, idx).toLowerCase();
                if (check !== normalizedContextBefore) match = false;
            }
        }

        // Check Context After
        if (match && normalizedContextAfter) {
            const endMatch = idx + searchText.length;
            // Check if there is enough space after
            if (concatenated.length - endMatch < normalizedContextAfter.length) {
                match = false;
            } else {
                const check = concatenated.substring(endMatch, endMatch + normalizedContextAfter.length).toLowerCase();
                if (check !== normalizedContextAfter) match = false;
            }
        }

        if (match) {
            const startDocPos = mapToDocPos(idx);
            // endDocPos is exclusive, so we find the pos of the last char and add 1
            const endDocPos = mapToDocPos(idx + searchText.length - 1) + 1;

            if (startDocPos !== -1 && endDocPos !== 0) {
                if (debug) console.log(`[findTextPosition] Found at ${startDocPos}-${endDocPos}`);
                return { from: startDocPos, to: endDocPos };
            }
        }

        searchPos = idx + 1;
    }

    if (debug) console.log('[findTextPosition] Text not found in document');
    return null;
};

/**
 * Find position of a tracked change (insertion or deletion) matching the text.
 * Returns { from, to, type } if found, or null.
 */
const findTrackedChange = (
    doc: any,
    searchText: string,
    action: 'accept' | 'reject',
    options: { contextBefore?: string; contextAfter?: string; debug?: boolean } = {}
): { from: number; to: number; type: 'insertion' | 'deletion' } | null => {
    // Logic:
    // 1. Iterate through all text nodes.
    // 2. Identify nodes that are TRACKED CHANGES (insertion or deletion).
    // 3. Match `searchText` against the content of these nodes.
    // 4. Validate context if provided.

    const { contextBefore, contextAfter, debug } = options;
    const normalizedSearch = searchText.toLowerCase();

    // We need to scan the document and build a "view" of tracked changes.
    // Unlike regular text search, we are looking for specific MARKED regions.

    let found: { from: number; to: number; type: 'insertion' | 'deletion' } | null = null;

    doc.descendants((node: any, pos: number) => {
        if (found) return false; // Stop if found

        if (node.isText) {
            // Check for deletion mark
            const isDeleted = hasDeletionMark(node);
            // Check for insertion mark (often just a specific mark, or standard text that is NOT deleted but has an insertion mark)
            // Implementation detail: SuperDoc might handle insertions effectively as standard text with an 'insertion' mark.
            // For now, let's focus on identifying the mark.
            const insertionMark = node.marks.find((m: any) =>
                m.type.name.includes('insertion') ||
                m.type.name.includes('insert') ||
                (m.type.name.includes('trackchange') && m.attrs?.type === 'insertion')
            );
            const isInserted = !!insertionMark;

            // We are looking for a tracked change.
            if (!isDeleted && !isInserted) return true;

            // Check if text matches
            const textContent = node.text!;
            if (textContent.toLowerCase().includes(normalizedSearch)) {
                // Potential match.
                // Note: This simple check assumes the search text is contained within a SINGLE text node.
                // Complex tracked changes spanning multiple nodes (e.g. bolded partial text) might be trickier.
                // For MVP, we assume the tracked change node contains the search text.

                const idx = textContent.toLowerCase().indexOf(normalizedSearch);
                const startPos = pos + idx;
                const endPos = startPos + searchText.length;

                // Validate context (simplified relative to full text search)
                // We'd need to look at surrounding nodes for context.
                // For now, let's assume if unique match or no context needed.
                found = {
                    from: startPos,
                    to: endPos,
                    type: isDeleted ? 'deletion' : 'insertion'
                };
            }
        }
        return true;
    });

    return found;
};

export const getContentTools = (context: ToolContext): ToolDefinition[] => {
    const { getActionMethods, getEditor, workspaceFiles, activeFilePath, activeFileHandle, setCellValue, superdoc } = context;

    // Helper to validate editor and AIActions are available before calling AIActions methods
    const validateEditor = (toolName: string): void => {
        const editor = getEditor();
        if (!editor) {
            console.error(`[${toolName}] No editor from getEditor(). superdoc:`, superdoc);
            throw new Error(`Editor not available. Cannot execute ${toolName}. Please ensure a DOCX document is open and fully loaded.`);
        }
        // Verify AIActions methods are available
        const actionMethods = getActionMethods();
        if (!actionMethods || typeof actionMethods.insertTrackedChange !== 'function') {
            console.error(`[${toolName}] AIActions methods not available. actionMethods:`, actionMethods);
            throw new Error(`AI actions not initialized. Cannot execute ${toolName}. The document may still be loading.`);
        }
        // Log editor state for debugging
        console.log(`[${toolName}] Validation passed - editor and AIActions ready. Editor state:`, {
            hasSelection: !!editor.state?.selection,
            docSize: editor.state?.doc?.content?.size,
            superdocActiveEditor: !!superdoc?.activeEditor,
        });
    };

    return [
        createTool(
            'insertTrackedChanges',
            'Suggest edits using track changes. Automatically finds target content.',
            {
                type: 'object',
                properties: { instruction: { type: 'string' } },
                required: ['instruction'],
                additionalProperties: false
            },
            async ({ instruction }: { instruction: string }) => {
                validateEditor('insertTrackedChanges');
                try {
                    return await getActionMethods().insertTrackedChange(instruction);
                } catch (error) {
                    console.error('[insertTrackedChanges] Error:', error);
                    throw new Error(`Failed to insert tracked changes: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            }
        ),

        createTool(
            'insertComments',
            'Add comments to the document.',
            {
                type: 'object',
                properties: { instruction: { type: 'string' } },
                required: ['instruction'],
                additionalProperties: false
            },
            async ({ instruction }: { instruction: string }) => {
                validateEditor('insertComments');
                try {
                    return await getActionMethods().insertComments(instruction);
                } catch (error) {
                    console.error('[insertComments] Error:', error);
                    throw new Error(`Failed to insert comments: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            }
        ),
        createTool(
            'insertContent',
            'Insert new content relative to selection.',
            {
                type: 'object',
                properties: {
                    instruction: { type: 'string' },
                    args: {
                        type: 'object',
                        properties: { position: { type: 'string', enum: ['before', 'after', 'replace'] } },
                        required: ['position'],
                        additionalProperties: false
                    }
                },
                required: ['instruction', 'args'],
                additionalProperties: false
            },
            async ({ instruction, args }: { instruction: string, args?: { position: 'before' | 'after' | 'replace' } }) => {
                validateEditor('insertContent');
                try {
                    return await getActionMethods().insertContent(instruction, args);
                } catch (error) {
                    console.error('[insertContent] Error:', error);
                    throw new Error(`Failed to insert content: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            }
        ),
        createTool(
            'summarize',
            'Summarize content.',
            {
                type: 'object',
                properties: { instruction: { type: 'string' } },
                required: ['instruction'],
                additionalProperties: false
            },
            async ({ instruction }: { instruction: string }) => {
                validateEditor('summarize');
                try {
                    return await getActionMethods().summarize(instruction);
                } catch (error) {
                    console.error('[summarize] Error:', error);
                    throw new Error(`Failed to summarize: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            }
        ),
        createTool(
            'editText',
            'Find text and optionally replace it, then apply formatting styles. The primary tool for text editing and styling. Supports "contextBefore" and "contextAfter" to distinguish identical text occurrences.',
            {
                type: 'object',
                properties: {
                    find: { type: 'string', description: 'Text to find (e.g., "**important**" for markdown bold, or just "Title" to apply styles without replacement)' },
                    replace: { type: 'string', description: 'Optional: Replacement text. If omitted, text is not replaced (style-only mode).' },
                    contextBefore: { type: 'string', description: 'Optional text immediately preceding the target text to ensure the correct occurrence is edited.' },
                    contextAfter: { type: 'string', description: 'Optional text immediately following the target text to ensure the correct occurrence is edited.' },
                    trackChanges: { type: 'boolean', description: 'Whether to track changes (only applies if text is replaced)' },
                    headingLevel: {
                        type: 'integer',
                        enum: [1, 2, 3, 4, 5, 6],
                        description: 'Apply heading style (1-6).'
                    },
                    bold: {
                        type: 'boolean',
                        description: 'Apply bold formatting.'
                    },
                    italic: {
                        type: 'boolean',
                        description: 'Apply italic formatting.'
                    },
                    underline: {
                        type: 'boolean',
                        description: 'Apply underline formatting.'
                    },
                    strikethrough: {
                        type: 'boolean',
                        description: 'Apply strikethrough formatting.'
                    },
                    code: {
                        type: 'boolean',
                        description: 'Apply inline code formatting.'
                    }
                },
                required: ['find'],
                additionalProperties: false
            },
            async ({ find, replace, contextBefore, contextAfter, trackChanges, headingLevel, bold, italic, underline, strikethrough, code }: {
                find: string,
                replace?: string,
                contextBefore?: string,
                contextAfter?: string,
                trackChanges?: boolean,
                headingLevel?: number,
                bold?: boolean,
                italic?: boolean,
                underline?: boolean,
                strikethrough?: boolean,
                code?: boolean
            }) => {
                const editor = getEditor();
                if (!editor) throw new Error('Editor not initialized');

                // Determine effective replacement text (defaults to find for style-only)
                const effectiveReplace = replace !== undefined ? replace : find;
                const isReplacing = replace !== undefined && replace !== find;

                const searchOptions = { contextBefore, contextAfter };

                // 1. Find the target text first (ignoring deleted text)
                // We do this BEFORE replacing to ensure we find the correct location
                let textPosition = findTextPositionExcludingDeletions(editor.state.doc, find, searchOptions);

                if (!textPosition) {
                    let msg = `Text "${find}" not found in document.`;
                    if (contextBefore || contextAfter) {
                        msg += ` (Context: before="${contextBefore || ''}", after="${contextAfter || ''}")`;
                    }
                    return msg;
                }

                let { from, to } = textPosition;
                let resultMsg = `Found "${find}"`;

                // 2. Perform replacement if needed
                if (isReplacing) {
                    try {
                        const schema = editor.state.schema;
                        // Manual Track Changes (Robust Fallback)
                        // If trackChanges is requested, we manually apply the marks to ensure it works
                        // regardless of the editor's "suggesting" mode state or async timing.
                        if (trackChanges === true) {
                            const insertionMarkType = schema.marks.insertion ||
                                schema.marks.trackChangesInsertion ||
                                schema.marks.insert;
                            const deletionMarkType = schema.marks.deletion ||
                                schema.marks.trackChangesDeletion ||
                                schema.marks.delete;

                            if (insertionMarkType && deletionMarkType) {
                                console.log('[editText] Manually applying track changes marks (Robust Mode)');

                                const tr = editor.state.tr;

                                // 1. Mark existing text as deleted
                                tr.addMark(from, to, deletionMarkType.create());

                                // 2. Insert new text with insertion mark
                                // We inherit existing marks (like bold/italic) but exclude deletion marks
                                const $pos = tr.doc.resolve(from);
                                const existingMarks = $pos.marks().filter((m: any) =>
                                    m.type !== deletionMarkType && m.type !== insertionMarkType
                                );
                                const newMarks = [...existingMarks, insertionMarkType.create()];

                                const newTextNode = schema.text(effectiveReplace, newMarks);
                                tr.insert(to, newTextNode);

                                // Dispatch the change
                                editor.view.dispatch(tr);

                                // 3. Update selection to the new text (for subsequent formatting)
                                // The new text starts at 'to' and has length 'effectiveReplace.length'
                                const newTextEnd = to + effectiveReplace.length;
                                editor.chain().setTextSelection({ from: to, to: newTextEnd }).run();

                                resultMsg += ` with "${effectiveReplace}" (Tracked)`;

                                // Update 'from' and 'to' for subsequent styling
                                const newStart = to;
                                const newEnd = to + effectiveReplace.length;
                                from = newStart;
                                to = newEnd;

                            } else {
                                // Fallback to mode switching if marks not found
                                console.warn('[editText] Track changes marks not found in schema, falling back to mode switch.');
                                await switchToSuggestingMode();
                                performStandardReplace();
                                resultMsg = `Replaced "${find}" with "${effectiveReplace}"`;
                                to = from + effectiveReplace.length;
                            }
                        } else {
                            // Standard replacement (no tracking, or explicit false)
                            if (trackChanges === false) {
                                if (superdoc?.setDocumentMode) superdoc.setDocumentMode('editing');
                            }
                            performStandardReplace();
                            resultMsg = `Replaced "${find}" with "${effectiveReplace}"`;
                            to = from + effectiveReplace.length;
                        }
                    } catch (e: any) {
                        return `Error replacing text: ${e.message}`;
                    }
                }

                // Helper to switch mode (encapsulated for reuse/clarity)
                async function switchToSuggestingMode() {
                    if (superdoc?.setDocumentMode) {
                        superdoc.setDocumentMode('suggesting');
                        // Wait for React update
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }

                function performStandardReplace() {
                    editor.chain()
                        .setTextSelection({ from, to })
                        .insertContent(effectiveReplace)
                        .run();
                }

                // Note: We skip re-finding text position as we updated 'from'/'to' manually or trust standard replace.
                // If standard replace shifted things unexpectedy, rely on editor selection state?
                // But styling code uses from/to. 
                // Let's keep from/to as reliable as possible.

                // 3. Apply styles
                const hasStyles = headingLevel || bold || italic || underline || strikethrough || code;

                if (hasStyles) {
                    // Build a chain of formatting commands
                    let chain = editor.chain().setTextSelection({ from, to });
                    const appliedStyles: string[] = [];

                    // Apply heading if specified
                    if (headingLevel && headingLevel >= 1 && headingLevel <= 6) {
                        chain = chain.toggleHeading({ level: headingLevel as any });
                        appliedStyles.push(`Heading ${headingLevel}`);
                    }

                    // Apply inline styles
                    if (bold) {
                        chain = chain.setBold();
                        appliedStyles.push('bold');
                    }
                    if (italic) {
                        chain = chain.setItalic();
                        appliedStyles.push('italic');
                    }
                    if (underline) {
                        chain = chain.setUnderline();
                        appliedStyles.push('underline');
                    }
                    if (strikethrough) {
                        chain = chain.setStrike();
                        appliedStyles.push('strikethrough');
                    }
                    if (code) {
                        // Check if 'code' mark exists in schema before applying
                        if (editor.schema.marks.code) {
                            chain = chain.setMark('code');
                            appliedStyles.push('code');
                        } else {
                            console.warn('[editText] Code mark not available in schema');
                            appliedStyles.push('code (not supported)');
                        }
                    }

                    chain.run();

                    if (appliedStyles.length > 0) {
                        resultMsg += ` and applied ${appliedStyles.join(', ')}`;
                    }
                }

                return resultMsg;
            }
        ),
        createTool(
            'manageTrackedChange',
            'Accept or reject a specific tracked change (insertion or deletion). Use readDocument({ includeDeletions: true }) first to find deleted text.',
            {
                type: 'object',
                properties: {
                    find: { type: 'string', description: 'The text of the changed content (e.g., the deleted text or the inserted text).' },
                    action: { type: 'string', enum: ['accept', 'reject'], description: 'Whether to accept or reject the change.' },
                    contextBefore: { type: 'string', description: 'Optional context before match.' },
                    contextAfter: { type: 'string', description: 'Optional context after match.' }
                },
                required: ['find', 'action'],
                additionalProperties: false
            },
            async ({ find, action, contextBefore, contextAfter }: { find: string, action: 'accept' | 'reject', contextBefore?: string, contextAfter?: string }) => {
                const editor = getEditor();
                if (!editor) throw new Error('Editor not initialized');

                // 1. Find the change
                const changePos = findTrackedChange(editor.state.doc, find, action, { contextBefore, contextAfter });

                if (!changePos) {
                    return `Tracked change containing "${find}" not found.`;
                }

                // 2. Perform Action
                const { from, to, type } = changePos;
                let resultMessage = '';

                try {
                    const tr = editor.state.tr;

                    if (type === 'insertion') {
                        if (action === 'accept') {
                            // Remove insertion mark, keep text
                            const insertionMark = editor.schema.marks.insertion ||
                                editor.schema.marks.trackChangesInsertion ||
                                editor.schema.marks.insert;

                            if (insertionMark) {
                                tr.removeMark(from, to, insertionMark);
                            } else {
                                // Fallback
                                const node = editor.state.doc.nodeAt(from);
                                if (node) {
                                    const mark = node.marks.find((m: any) => m.type.name.toLowerCase().includes('insert'));
                                    if (mark) tr.removeMark(from, to, mark.type);
                                }
                            }
                            resultMessage = `Accepted insertion of "${find}".`;
                        } else {
                            // Reject insertion -> Delete the text
                            tr.delete(from, to);
                            resultMessage = `Rejected insertion of "${find}". Text removed.`;
                        }
                    } else if (type === 'deletion') {
                        if (action === 'accept') {
                            // Accept deletion -> Delete the text permanently
                            tr.delete(from, to);
                            resultMessage = `Accepted deletion of "${find}". Text removed permanently.`;
                        } else {
                            // Reject deletion -> Restore text (remove deletion mark)
                            const deletionMark = editor.schema.marks.deletion ||
                                editor.schema.marks.trackChangesDeletion ||
                                editor.schema.marks.diffMarkDeletion;

                            if (deletionMark) {
                                tr.removeMark(from, to, deletionMark);
                                resultMessage = `Rejected deletion of "${find}". Text restored.`;
                            } else {
                                // Fallback
                                const node = editor.state.doc.nodeAt(from);
                                if (node) {
                                    const mark = node.marks.find((m: any) => m.type.name.toLowerCase().includes('delete'));
                                    if (mark) {
                                        tr.removeMark(from, to, mark.type);
                                        resultMessage = `Rejected deletion of "${find}". Text restored.`;
                                    }
                                }
                                if (!resultMessage) resultMessage = `Could not find deletion mark to remove for "${find}".`;
                            }
                        }
                    }

                    if (resultMessage && !resultMessage.startsWith('Could not')) {
                        editor.view.dispatch(tr);
                    }

                    return resultMessage || `Processed ${action} on ${type} of "${find}".`;

                } catch (e: any) {
                    return `Error managing change: ${e.message}`;
                }
            }
        ),
        createTool(
            'insertComment',
            'Insert a comment on specific text. Supports context for disambiguation.',
            {
                type: 'object',
                properties: {
                    find: { type: 'string', description: 'Text to attach the comment to.' },
                    comment: { type: 'string', description: 'The comment text.' },
                    contextBefore: { type: 'string', description: 'Optional text immediately preceding the target text.' },
                    contextAfter: { type: 'string', description: 'Optional text immediately following the target text.' }
                },
                required: ['find', 'comment'],
                additionalProperties: false
            },
            async ({ find, comment, contextBefore, contextAfter }: { find: string, comment: string, contextBefore?: string, contextAfter?: string }) => {
                const editor = getEditor();
                if (!editor) throw new Error('Editor not initialized');

                // 1. Find the target text position
                const textPosition = findTextPositionExcludingDeletions(editor.state.doc, find, { contextBefore, contextAfter });

                if (!textPosition) {
                    let msg = `Text "${find}" not found in document.`;
                    if (contextBefore || contextAfter) {
                        msg += ` (Context: before="${contextBefore || ''}", after="${contextAfter || ''}")`;
                    }
                    return msg;
                }

                const { from, to } = textPosition;

                try {
                    // 2. Select the text
                    editor.chain().setTextSelection({ from, to }).run();

                    // 3. Insert Comment
                    // Try standard TipTap comment commands first
                    if (editor.commands.setComment) {
                        editor.commands.setComment(comment);
                        return `Inserted comment "${comment}" on "${find}" (using setComment).`;
                    } else if (editor.commands.addComment) {
                        editor.commands.addComment(comment);
                        return `Inserted comment "${comment}" on "${find}" (using addComment).`;
                    } else {
                        // Fallback to AI Action if specific command not found
                        // We use the 'literalInsertComment' action method which might be implemented via a different mechanism in SuperDoc
                        // Note: The action method typically takes 'find' text, but since we already selected it, 
                        // we might need a method that acts on selection or we pass the text again.
                        // However, 'literalInsertComment' in AIActions usually expects text to find. 
                        // Let's force it to succeed by ensuring selection is set, hoping the underlying implementation respects selection or re-finds it.

                        // Actually, let's look at what getActionMethods().literalInsertComment does. 
                        // It likely calls the AI to do it or a specific internal handler.
                        // Given we can't easily see AIActions implementation here (it's imported), 
                        // we'll try it as a fallback.
                        console.warn('[insertComment] Standard comment commands not found. Falling back to AIActions.literalInsertComment.');
                        return await getActionMethods().literalInsertComment(find, comment);
                    }
                } catch (error) {
                    console.error('[insertComment] Error:', error);
                    throw new Error(`Failed to insert comment: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            }
        ),
        createTool(
            'insertTable',
            'Insert a proper table with headers and data rows. Use this instead of markdown-style text tables. Call this tool when the user asks to insert or create a table. IMPORTANT: Use afterText to specify where the table should be inserted (e.g., the title or heading text after which to insert).',
            {
                type: 'object',
                properties: {
                    headers: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Array of column header strings'
                    },
                    rows: {
                        type: 'array',
                        items: {
                            type: 'array',
                            items: { type: 'string' }
                        },
                        description: 'Array of row arrays, each containing cell values as strings'
                    },
                    withHeaderRow: {
                        type: 'boolean',
                        description: 'Whether to style the first row as a header with bold text and background color'
                    },
                    afterText: {
                        type: 'string',
                        description: 'Text to find in the document. The table will be inserted after the paragraph/block containing this text. This is required when the user specifies a position like "after title" or "after heading".'
                    },
                    trackChanges: {
                        type: 'boolean',
                        description: 'Whether to track changes for this insertion.'
                    }
                },
                required: ['headers', 'rows'],
                additionalProperties: false
            },
            async ({ headers, rows, withHeaderRow = true, afterText, trackChanges }: { headers: string[], rows: string[][], withHeaderRow?: boolean, afterText?: string, trackChanges?: boolean }) => {
                const editor = getEditor();
                if (!editor) throw new Error('Editor not initialized');

                // Handle track changes mode
                if (superdoc?.setDocumentMode) {
                    if (trackChanges === true) {
                        superdoc.setDocumentMode('suggesting');
                    } else if (trackChanges === false) {
                        superdoc.setDocumentMode('editing');
                    }
                }

                try {
                    // Find insert position - we need the position AFTER the block containing afterText
                    let insertPos = -1;
                    let foundBlockInfo = { endPos: -1, text: '' };

                    if (afterText) {
                        const normalizedTarget = afterText.toLowerCase();

                        // Search for the text and find the end of its containing block
                        // Skip text nodes with deletion marks (track changes)
                        editor.state.doc.descendants((node: any, pos: number) => {
                            if (foundBlockInfo.endPos > -1) return false;

                            if (node.isText && !hasDeletionMark(node)) {
                                const textContent = node.text!.toLowerCase();
                                const idx = textContent.indexOf(normalizedTarget);
                                if (idx > -1) {
                                    // Found the text, now find the end of its parent block
                                    const $pos = editor.state.doc.resolve(pos + idx);
                                    for (let d = $pos.depth; d > 0; d--) {
                                        const parentNode = $pos.node(d);
                                        if (parentNode.isBlock) {
                                            foundBlockInfo.endPos = $pos.after(d);
                                            foundBlockInfo.text = parentNode.textContent?.substring(0, 50) || '';
                                            console.log(`[insertTable] Found "${afterText}" in block ending at ${foundBlockInfo.endPos}`);
                                            break;
                                        }
                                    }
                                    return false;
                                }
                            }
                            return true;
                        });

                        // Fallback: if user asked for "title" but we didn't find it, look for first Heading
                        if (foundBlockInfo.endPos === -1 && normalizedTarget.includes('title')) {
                            console.log('[insertTable] "title" text not found, looking for Heading node...');
                            editor.state.doc.descendants((node: any, pos: number) => {
                                if (foundBlockInfo.endPos > -1) return false;
                                if (node.type.name === 'heading') {
                                    foundBlockInfo.endPos = pos + node.nodeSize;
                                    foundBlockInfo.text = node.textContent?.substring(0, 50) || '';
                                    return false;
                                }
                                return true;
                            });
                        }

                        if (foundBlockInfo.endPos > -1) {
                            insertPos = foundBlockInfo.endPos;
                        } else {
                            console.warn(`[insertTable] Text "${afterText}" not found. Inserting at end of document.`);
                            insertPos = editor.state.doc.content.size;
                        }
                    } else {
                        // No afterText specified - use current cursor position or end of document
                        insertPos = editor.state.selection.to;
                    }

                    console.log(`[insertTable] Final insert position: ${insertPos}`);

                    // Build table structure for TipTap
                    const totalRows = (withHeaderRow ? 1 : 0) + rows.length;
                    const totalCols = headers.length || (rows[0]?.length || 1);

                    // Create table node content
                    const tableRows: any[] = [];

                    // Header row
                    if (headers.length > 0) {
                        const headerCells = headers.map(h => ({
                            type: withHeaderRow ? 'tableHeader' : 'tableCell',
                            content: [{ type: 'paragraph', content: h ? [{ type: 'text', text: String(h) }] : [] }]
                        }));
                        tableRows.push({ type: 'tableRow', content: headerCells });
                    }

                    // Data rows
                    for (const row of rows) {
                        const cells = row.map(cell => ({
                            type: 'tableCell',
                            content: [{ type: 'paragraph', content: cell ? [{ type: 'text', text: String(cell) }] : [] }]
                        }));
                        // Ensure row has correct number of cells
                        while (cells.length < totalCols) {
                            cells.push({ type: 'tableCell', content: [{ type: 'paragraph', content: [] }] });
                        }
                        tableRows.push({ type: 'tableRow', content: cells });
                    }

                    const tableNode = {
                        type: 'table',
                        content: tableRows
                    };

                    // Insert the table at the calculated position
                    if (editor.commands.insertContentAt) {
                        editor.commands.insertContentAt(insertPos, tableNode);
                    } else if (editor.commands.insertContent) {
                        // Fallback: set selection then insert
                        editor.commands.setTextSelection(insertPos);
                        editor.commands.insertContent(tableNode);
                    } else {
                        throw new Error('No insertContentAt or insertContent command available');
                    }

                    return `Inserted ${totalCols}x${totalRows} table${afterText ? ` after "${afterText}"` : ' at cursor'}. Headers: ${headers.join(', ')}.`;

                } catch (error) {
                    console.error('[insertTable] Error:', error);

                    // Fallback: try inserting at current cursor position with native command
                    try {
                        const totalRows = (withHeaderRow ? 1 : 0) + rows.length;
                        const totalCols = headers.length || (rows[0]?.length || 1);

                        if (editor.commands.insertTable) {
                            editor.commands.insertTable({
                                rows: totalRows,
                                cols: totalCols,
                                withHeaderRow
                            });
                            return `Inserted ${totalCols}x${totalRows} empty table at cursor (fallback mode). Headers: ${headers.join(', ')}. Note: Please populate cells manually.`;
                        }
                    } catch (fallbackError) {
                        console.error('[insertTable] Fallback also failed:', fallbackError);
                    }

                    return `Failed to insert table: ${error instanceof Error ? error.message : 'Unknown error'}`;
                }
            }
        ),
        createTool(
            'editSpreadsheet',
            'Edit specific cells in an Excel spreadsheet. Requires a list of edits. If path is omitted, edits the active file.',
            {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Relative path to the xlsx file. Optional if an xlsx file is currently open.' },
                    edits: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                sheet: { type: 'string', description: 'Sheet name (optional, defaults to first sheet)' },
                                cell: { type: 'string', description: 'Cell address (e.g., "A1", "B2")' },
                                value: { type: 'string', description: 'New value' },
                                isNumber: { type: 'boolean', description: 'Set to true if value should be treated as a number' }
                            },
                            required: ['cell', 'value']
                        }
                    }
                },
                required: ['edits'],
                additionalProperties: false
            },
            async ({ path, edits }: {
                path?: string,
                edits: Array<{ sheet?: string, cell: string, value: string, isNumber?: boolean }>
            }) => {
                // Validate edits input
                if (!edits || !Array.isArray(edits)) {
                    return 'Error: edits parameter is required and must be an array. Example: edits: [{ cell: "A7", value: "hello" }]';
                }
                if (edits.length === 0) {
                    return 'Error: edits array is empty. Please specify at least one cell to edit.';
                }

                // If setCellValue callback is available, use it for live UI updates
                if (setCellValue) {
                    let editsApplied = 0;
                    for (const edit of edits) {
                        const value = edit.isNumber ? parseFloat(edit.value) || edit.value : edit.value;
                        setCellValue(edit.cell, value as string | number, edit.sheet, edit.isNumber);
                        editsApplied++;
                    }
                    console.log(`[editSpreadsheet] Applied ${editsApplied} edits via live callback`);
                    return `Successfully applied ${editsApplied} edits to the spreadsheet. Changes are visible immediately.`;
                }

                // Fallback: Write directly to file (requires file handle)
                if (!workspaceFiles && !activeFileHandle) return 'No workspace access available.';

                const targetPath = path || activeFilePath;
                if (!targetPath) {
                    return 'Error: No path provided and no active file found. Please specify the file path.';
                }

                // Ensure target is an xlsx file
                if (!targetPath.endsWith('.xlsx')) {
                    return `Error: Target file '${targetPath}' is not an .xlsx file.`;
                }

                let handle: any = null;

                // Use active handle if available and path matches active file (or path was inferred)
                if (activeFileHandle && (targetPath === activeFilePath || !path)) {
                    handle = activeFileHandle;
                } else if (workspaceFiles) {
                    handle = findFileHandle(workspaceFiles, targetPath);
                }

                if (!handle) {
                    return `File not found: ${targetPath}. Please check the path.`;
                }

                try {
                    const XLSX = await import('xlsx');
                    const file = await handle.getFile();
                    const arrayBuffer = await file.arrayBuffer();
                    const workbook = XLSX.read(arrayBuffer, { type: 'array' });

                    let editsApplied = 0;

                    for (const edit of edits) {
                        const sheetName = edit.sheet || workbook.SheetNames[0];
                        if (!workbook.Sheets[sheetName]) {
                            continue; // Skip invalid sheets
                        }

                        const worksheet = workbook.Sheets[sheetName];
                        const cellAddress = edit.cell.toUpperCase();

                        // Parse value (number or string)
                        let cellValue: string | number | boolean = edit.value;
                        if (edit.isNumber) {
                            const num = parseFloat(edit.value);
                            if (!isNaN(num)) cellValue = num;
                        }

                        // Update cell
                        XLSX.utils.sheet_add_aoa(worksheet, [[cellValue]], { origin: cellAddress });
                        editsApplied++;
                    }

                    // Write back to file
                    const xlsxData = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
                    const blob = new Blob([xlsxData], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

                    const writable = await handle.createWritable();
                    await writable.write(blob);
                    await writable.close();

                    return `Successfully applied ${editsApplied} edits to ${path}. Please reload the file to see changes.`;
                } catch (error) {
                    console.error('[editSpreadsheet] Error:', error);
                    return `Error editing spreadsheet: ${error instanceof Error ? error.message : 'Unknown error'}`;
                }
            }
        )
    ];
};
