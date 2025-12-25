/* eslint-disable @typescript-eslint/no-explicit-any */
import { ToolDefinition, createTool, ToolContext } from '../types';
import { validateEditor, findTextPositionExcludingDeletions } from './utils';

interface ExtractedComment {
    commentId: string;
    author: string;
    date: string;
    content: string;      // The feedback/comment text
    anchoredText: string; // The exact text the comment is attached to
    blockIndex: number;   // Block index for readDocument context
    blockId: string | null; // The sdBlockId of the block
    contextBefore: string; // ~50 chars before for context
    contextAfter: string;  // ~50 chars after for context
}

export const getCommentsTools = (context: ToolContext): ToolDefinition[] => {
    return [
        createTool(
            'readComments',
            'Read all comments in the document with their anchored text and block context. Use this to understand user feedback and where it applies.',
            {
                type: 'object',
                properties: {},
                additionalProperties: false
            },
            async () => {
                const { getEditor } = context;
                const editor = getEditor();
                if (!editor) throw new Error('Editor not initialized');

                const doc = editor.state.doc;
                const comments: ExtractedComment[] = [];
                const seenIds = new Set<string>();

                // Build block index mapping: pos -> { blockIndex, blockId }
                const blockInfo: { pos: number; endPos: number; index: number; blockId: string | null }[] = [];
                let blockIndex = 0;
                doc.descendants((node: any, pos: number) => {
                    if (node.isBlock && ['paragraph', 'heading', 'listItem', 'table'].includes(node.type.name)) {
                        blockInfo.push({
                            pos,
                            endPos: pos + node.nodeSize,
                            index: blockIndex,
                            blockId: node.attrs.sdBlockId || null
                        });
                        blockIndex++;
                    }
                    return true;
                });

                // Find block by position
                const findBlockForPos = (pos: number) => {
                    for (const block of blockInfo) {
                        if (pos >= block.pos && pos < block.endPos) {
                            return block;
                        }
                    }
                    return null;
                };

                // Get context around a position
                const getContext = (pos: number, length: number, direction: 'before' | 'after', maxChars: number = 50): string => {
                    const fullText = doc.textContent;
                    // Convert ProseMirror pos to text offset (approximate)
                    let textOffset = 0;
                    let foundOffset = -1;
                    doc.descendants((node: any, nodePos: number) => {
                        if (foundOffset >= 0) return false;
                        if (node.isText) {
                            if (nodePos <= pos && pos <= nodePos + node.nodeSize) {
                                foundOffset = textOffset + (pos - nodePos);
                                return false;
                            }
                            textOffset += node.text?.length || 0;
                        }
                        return true;
                    });

                    if (foundOffset < 0) return '';

                    if (direction === 'before') {
                        const start = Math.max(0, foundOffset - maxChars);
                        return fullText.substring(start, foundOffset).trim();
                    } else {
                        const end = Math.min(fullText.length, foundOffset + length + maxChars);
                        return fullText.substring(foundOffset + length, end).trim();
                    }
                };

                // Traverse document to find comment marks
                doc.descendants((node: any, pos: number) => {
                    if (!node.isText) return true;

                    node.marks.forEach((mark: any) => {
                        if (mark.type.name === 'comment') {
                            const { commentId, author, date, content } = mark.attrs;
                            if (commentId && !seenIds.has(commentId)) {
                                seenIds.add(commentId);

                                const anchoredText = node.text || '';
                                const block = findBlockForPos(pos);

                                comments.push({
                                    commentId,
                                    author: author || 'Unknown',
                                    date: date || '',
                                    content: content || '',
                                    anchoredText,
                                    blockIndex: block?.index ?? -1,
                                    blockId: block?.blockId ?? null,
                                    contextBefore: getContext(pos, anchoredText.length, 'before'),
                                    contextAfter: getContext(pos, anchoredText.length, 'after')
                                });
                            }
                        }
                    });

                    return true;
                });

                if (comments.length === 0) {
                    return 'No comments found in the document.';
                }

                // Format output for agent
                const output = comments.map((c, i) => {
                    return `## Comment ${i + 1}
- **Author**: ${c.author}
- **Date**: ${c.date}
- **Feedback**: ${c.content}
- **Anchored Text**: "${c.anchoredText}"
- **Block Index**: ${c.blockIndex} (use \`readDocument({ startBlock: ${Math.max(0, c.blockIndex - 10)}, endBlock: ${c.blockIndex + 10} })\` for context)
- **Context**: ...${c.contextBefore} [ANCHORED TEXT] ${c.contextAfter}...`;
                }).join('\n\n');

                return `Found ${comments.length} comment(s):\n\n${output}\n\n---\n**Workflow**: Use \`readDocument\` with block ranges above to understand context, then use \`editText\` to apply changes based on feedback.`;
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
                const { getActionMethods } = context;
                const actionMethods = getActionMethods();

                // Fallback for CustomDocEditor
                if (!actionMethods || typeof actionMethods.insertComments !== 'function') {
                    return 'This AI-powered comment feature is not available. Please use the `insertComment` tool to insert comments on specific text.';
                }

                validateEditor('insertComments', context);
                try {
                    return await actionMethods.insertComments(instruction);
                } catch (error) {
                    console.error('[insertComments] Error:', error);
                    throw new Error(`Failed to insert comments: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
                const { getEditor, getActionMethods } = context;
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
                        console.warn('[insertComment] Standard comment commands not found. Falling back to AIActions.literalInsertComment.');
                        return await getActionMethods().literalInsertComment(find, comment);
                    }
                } catch (error) {
                    console.error('[insertComment] Error:', error);
                    throw new Error(`Failed to insert comment: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            }
        )
    ];
};
