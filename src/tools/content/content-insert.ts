import { ToolDefinition, createTool, ToolContext } from '../types';
import { validateEditor, findTextPositionExcludingDeletions } from './utils';

export const getContentInsertTools = (context: ToolContext): ToolDefinition[] => {
    return [
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
                const { getActionMethods } = context;
                validateEditor('insertContent', context);
                try {
                    return await getActionMethods().insertContent(instruction, args);
                } catch (error) {
                    console.error('[insertContent] Error:', error);
                    throw new Error(`Failed to insert content: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            }
        ),
        createTool(
            'insertText',
            'Insert text at a specific location in the document by finding anchor text. Use this when you need to ADD new content without replacing existing text. Supports inserting before or after found text.',
            {
                type: 'object',
                properties: {
                    text: { type: 'string', description: 'The text content to insert' },
                    anchorText: { type: 'string', description: 'Text to find in the document to anchor the insertion position' },
                    position: {
                        type: 'string',
                        enum: ['before', 'after'],
                        description: 'Whether to insert before or after the anchor text. Default is "after".'
                    },
                    asNewParagraph: {
                        type: 'boolean',
                        description: 'If true, inserts as a new paragraph (adds line break). Default is true.'
                    },
                    contextBefore: { type: 'string', description: 'Optional text immediately preceding the anchor text to ensure the correct occurrence is found.' },
                    contextAfter: { type: 'string', description: 'Optional text immediately following the anchor text to ensure the correct occurrence is found.' },
                    trackChanges: { type: 'boolean', description: 'Whether to track this insertion. Defaults to true.' }
                },
                required: ['text', 'anchorText'],
                additionalProperties: false
            },
            async ({ text, anchorText, position = 'after', asNewParagraph = true, contextBefore, contextAfter, trackChanges = true }: {
                text: string,
                anchorText: string,
                position?: 'before' | 'after',
                asNewParagraph?: boolean,
                contextBefore?: string,
                contextAfter?: string,
                trackChanges?: boolean
            }) => {
                const { getEditor } = context;
                const editor = getEditor();
                if (!editor) throw new Error('Editor not initialized');

                // 1. Find the anchor text
                const anchorPosition = findTextPositionExcludingDeletions(editor.state.doc, anchorText, { contextBefore, contextAfter });

                if (!anchorPosition) {
                    let msg = `Anchor text "${anchorText}" not found in document.`;
                    if (contextBefore || contextAfter) {
                        msg += ` (Context: before="${contextBefore || ''}", after="${contextAfter || ''}")`;
                    }
                    return msg;
                }

                const { from, to } = anchorPosition;

                // 2. Determine insert position
                // For 'after', we need to find the end of the containing block if asNewParagraph
                let insertPos = position === 'after' ? to : from;

                if (asNewParagraph) {
                    const $pos = editor.state.doc.resolve(position === 'after' ? to : from);
                    // Find the parent block
                    for (let d = $pos.depth; d > 0; d--) {
                        const parentNode = $pos.node(d);
                        if (parentNode.isBlock) {
                            insertPos = position === 'after' ? $pos.after(d) : $pos.before(d);
                            break;
                        }
                    }
                }

                console.log(`[insertText] Inserting "${text.substring(0, 30)}..." ${position} "${anchorText}" at position ${insertPos}`);

                try {
                    const schema = editor.state.schema;
                    const tr = editor.state.tr;

                    // 3. Create the content to insert
                    let contentToInsert;

                    if (asNewParagraph) {
                        // Create a paragraph node with the text
                        const paragraphType = schema.nodes.paragraph;
                        if (!paragraphType) {
                            throw new Error('Paragraph node type not found in schema');
                        }

                        if (trackChanges) {
                            // Add insertion mark for track changes
                            const insertionMarkType = schema.marks.insertion ||
                                schema.marks.trackChangesInsertion ||
                                schema.marks.insert;

                            if (insertionMarkType) {
                                const textWithMark = schema.text(text, [insertionMarkType.create()]);
                                contentToInsert = paragraphType.create(null, textWithMark);
                            } else {
                                console.warn('[insertText] Insertion mark not found, inserting without track changes');
                                contentToInsert = paragraphType.create(null, schema.text(text));
                            }
                        } else {
                            contentToInsert = paragraphType.create(null, schema.text(text));
                        }

                        tr.insert(insertPos, contentToInsert);
                    } else {
                        // Insert inline text
                        if (trackChanges) {
                            const insertionMarkType = schema.marks.insertion ||
                                schema.marks.trackChangesInsertion ||
                                schema.marks.insert;

                            if (insertionMarkType) {
                                const textWithMark = schema.text(text, [insertionMarkType.create()]);
                                tr.insert(insertPos, textWithMark);
                            } else {
                                console.warn('[insertText] Insertion mark not found, inserting without track changes');
                                tr.insertText(text, insertPos);
                            }
                        } else {
                            tr.insertText(text, insertPos);
                        }
                    }

                    // 4. Dispatch the transaction
                    editor.view.dispatch(tr);

                    const trackingStatus = trackChanges ? ' (tracked)' : '';
                    const paragraphStatus = asNewParagraph ? ' as new paragraph' : ' inline';
                    return `Inserted "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}" ${position} "${anchorText}"${paragraphStatus}${trackingStatus}`;

                } catch (e: any) {
                    console.error('[insertText] Error:', e);
                    return `Error inserting text: ${e.message}`;
                }
            }
        )
    ];
};
