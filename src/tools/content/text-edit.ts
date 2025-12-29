/* eslint-disable @typescript-eslint/no-explicit-any, prefer-const */
import { ToolDefinition, createTool, ToolContext } from '../types';
import { findTextPositionExcludingDeletions } from './utils';

export const getTextEditTools = (context: ToolContext): ToolDefinition[] => {
    return [
        createTool(
            'editText',
            'Find text and optionally replace it, then apply formatting styles. The primary tool for text editing and styling. Supports "blockIndex" to scope search to a specific block (recommended when called from reviewDocumentTypos), or "contextBefore"/"contextAfter" to distinguish identical text occurrences. Use "suggestionComment" to attach an explanatory comment to tracked changes.',
            {
                type: 'object',
                properties: {
                    find: { type: 'string', description: 'Text to find (e.g., "**important**" for markdown bold, or just "Title" to apply styles without replacement)' },
                    replace: { type: 'string', description: 'Optional: Replacement text. If omitted, text is not replaced (style-only mode).' },
                    blockIndex: { type: 'integer', description: 'Block index (0-indexed) to limit search scope. Use this when fixing issues from reviewDocumentTypos for reliable targeting.' },
                    contextBefore: { type: 'string', description: 'Optional text immediately preceding the target text to ensure the correct occurrence is edited.' },
                    contextAfter: { type: 'string', description: 'Optional text immediately following the target text to ensure the correct occurrence is edited.' },
                    // trackChanges: { type: 'boolean', description: 'Whether to track changes (only applies if text is replaced). Defaults to true.' },
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
                    },
                    suggestionComment: {
                        type: 'string',
                        description: 'Optional comment explaining WHY this change was made. Attaches a comment to the tracked change (visible in comment sidebar). Use this for typo fixes, style corrections, or any change that needs explanation.'
                    }
                },
                required: ['find'],
                additionalProperties: false
            },
            async ({ find, replace, blockIndex, contextBefore, contextAfter, headingLevel, bold, italic, underline, strikethrough, code, suggestionComment }: {
                find: string,
                replace?: string,
                blockIndex?: number,
                contextBefore?: string,
                contextAfter?: string,
                // trackChanges?: boolean,
                headingLevel?: number,
                bold?: boolean,
                italic?: boolean,
                underline?: boolean,
                strikethrough?: boolean,
                code?: boolean,
                suggestionComment?: string
            }) => {
                const { getEditor, superdoc } = context;
                const editor = getEditor();
                if (!editor) throw new Error('Editor not initialized');

                // Determine effective replacement text (defaults to find for style-only)
                const effectiveReplace = replace !== undefined ? replace : find;
                const isReplacing = replace !== undefined && replace !== find;

                // Determine block range if blockIndex is provided
                let blockRange: { from: number; to: number } | undefined;
                if (blockIndex !== undefined && editor.helpers?.blockNode?.getBlockNodes) {
                    const allBlocks = editor.helpers.blockNode.getBlockNodes();
                    if (blockIndex >= 0 && blockIndex < allBlocks.length) {
                        const block = allBlocks[blockIndex];
                        blockRange = {
                            from: block.pos,
                            to: block.pos + block.node.nodeSize
                        };
                        console.log(`[editText] Scoping search to block ${blockIndex}: pos ${blockRange.from}-${blockRange.to}`);
                    } else {
                        console.warn(`[editText] Invalid blockIndex ${blockIndex}, searching entire document`);
                    }
                }

                const searchOptions = { contextBefore, contextAfter, blockRange };

                // 1. Find the target text first (ignoring deleted text)
                // We do this BEFORE replacing to ensure we find the correct location
                const textPosition = findTextPositionExcludingDeletions(editor.state.doc, find, searchOptions);

                if (!textPosition) {
                    let msg = `Text "${find}" not found in document.`;
                    if (contextBefore || contextAfter) {
                        msg += ` (Context: before="${contextBefore || ''}", after="${contextAfter || ''}")`;
                    }
                    if (blockIndex !== undefined) {
                        msg += ` (Block index: ${blockIndex})`;
                    }
                    throw new Error(msg);
                }

                let { from, to } = textPosition;
                let resultMsg = `Found "${find}"`;

                // 2. Perform replacement if needed
                if (isReplacing) {
                    try {
                        const schema = editor.state.schema;
                        // Default trackChanges to true for replacements (unless explicitly false)
                        const shouldTrackChanges = true;

                        // Manual Track Changes (Robust Fallback)
                        // We manually apply the marks to ensure it works regardless of editor mode
                        if (shouldTrackChanges) {
                            const insertionMarkType = schema.marks.insertion ||
                                schema.marks.trackChangesInsertion ||
                                schema.marks.insert;
                            const deletionMarkType = schema.marks.deletion ||
                                schema.marks.trackChangesDeletion ||
                                schema.marks.delete;

                            if (insertionMarkType && deletionMarkType) {
                                console.log('[editText] Applying minimal diff track changes');

                                const tr = editor.state.tr;

                                // Compute minimal diff between original and replacement
                                // Find common prefix and suffix to minimize tracked changes
                                const originalText = find;
                                const newText = effectiveReplace;

                                // Find common prefix length
                                let prefixLen = 0;
                                const minLen = Math.min(originalText.length, newText.length);
                                while (prefixLen < minLen && originalText[prefixLen] === newText[prefixLen]) {
                                    prefixLen++;
                                }

                                // Find common suffix length (but don't overlap with prefix)
                                let suffixLen = 0;
                                while (
                                    suffixLen < (originalText.length - prefixLen) &&
                                    suffixLen < (newText.length - prefixLen) &&
                                    originalText[originalText.length - 1 - suffixLen] === newText[newText.length - 1 - suffixLen]
                                ) {
                                    suffixLen++;
                                }

                                // Calculate the changed portions
                                const deletedPart = originalText.slice(prefixLen, originalText.length - suffixLen);
                                const insertedPart = newText.slice(prefixLen, newText.length - suffixLen);

                                // Positions in document
                                const deleteFrom = from + prefixLen;
                                const deleteTo = to - suffixLen;

                                console.log(`[editText] Diff: prefix=${prefixLen}, suffix=${suffixLen}, delete="${deletedPart}", insert="${insertedPart}"`);

                                // Apply minimal changes
                                // Apply minimal changes
                                if (deletedPart.length > 0) {
                                    // Mark only the deleted portion
                                    tr.addMark(deleteFrom, deleteTo, deletionMarkType.create({
                                        author: 'AI Assistant',
                                        date: new Date().toISOString(),
                                        comment: suggestionComment || ''
                                    }));
                                }

                                if (insertedPart.length > 0) {
                                    // Insert only the new portion with insertion mark
                                    const $pos = tr.doc.resolve(deleteFrom);
                                    const existingMarks = $pos.marks().filter((m: any) =>
                                        m.type !== deletionMarkType && m.type !== insertionMarkType
                                    );
                                    const newMarks = [...existingMarks, insertionMarkType.create({
                                        author: 'AI Assistant',
                                        date: new Date().toISOString(),
                                        comment: suggestionComment || ''
                                    })];
                                    const newTextNode = schema.text(insertedPart, newMarks);
                                    tr.insert(deleteTo, newTextNode);
                                }

                                // Dispatch the change
                                editor.view.dispatch(tr);

                                // Update selection to end of new content
                                const newTextEnd = from + newText.length;
                                editor.chain().setTextSelection({ from, to: newTextEnd }).run();

                                resultMsg += ` with "${effectiveReplace}" (Tracked: -"${deletedPart || '(none)'}" +"${insertedPart || '(none)'}")`;

                                // Update from/to for subsequent styling
                                to = from + newText.length;

                                // Add suggestion comment info to result msg
                                if (suggestionComment) {
                                    console.log(`[editText] Added suggestion comment: "${suggestionComment}" to tracked change`);
                                    resultMsg += ` with comment: "${suggestionComment}"`;
                                }

                            } else {
                                // Fallback to mode switching if marks not found
                                console.warn('[editText] Track changes marks not found in schema, falling back to mode switch.');
                                await switchToSuggestingMode(superdoc);
                                performStandardReplace();
                                resultMsg = `Replaced "${find}" with "${effectiveReplace}"`;
                                to = from + effectiveReplace.length;
                            }
                        } else {
                            // Standard replacement (no tracking, or explicit false)
                            if (superdoc?.setDocumentMode) superdoc.setDocumentMode('editing');
                            performStandardReplace();
                            resultMsg = `Replaced "${find}" with "${effectiveReplace}"`;
                            to = from + effectiveReplace.length;
                        }
                    } catch (e: any) {
                        return `Error replacing text: ${e.message}`;
                    }
                }

                // Helper to switch mode (encapsulated for reuse/clarity)
                async function switchToSuggestingMode(superdoc: any) {
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
        )
    ];
};
