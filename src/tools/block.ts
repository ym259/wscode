import { ToolDefinition, createTool, ToolContext } from './types';

export const getBlockTools = (context: ToolContext): ToolDefinition[] => {
    const { getEditor } = context;

    return [
        createTool(
            'readDocument',
            'Read the current document content as structured blocks with their IDs. Use this to find the Block ID (sdBlockId) needed for deletion or precise updates. Supports reading a specific range of blocks using startIndex/endIndex to avoid loading the entire document.',
            {
                type: 'object',
                properties: {
                    includeStyles: {
                        type: 'boolean',
                        description: 'Whether to include block and inline style information (default: false)'
                    },
                    startIndex: {
                        type: 'integer',
                        description: 'Starting block index (0-indexed, default: 0). Use this with endIndex to read a specific range.'
                    },
                    endIndex: {
                        type: 'integer',
                        description: 'Ending block index (inclusive, default: all blocks). Use this with startIndex to read a specific range.'
                    }
                },
                required: [],
                additionalProperties: false
            },
            async ({ includeStyles = false, startIndex, endIndex }: { includeStyles?: boolean; startIndex?: number; endIndex?: number }) => {
                const editor = getEditor();
                if (!editor) throw new Error('Editor not initialized');

                if (!editor.helpers?.blockNode?.getBlockNodes) {
                    return 'Error: BlockNode helpers not available.';
                }

                // Get all block nodes
                const allBlocks = editor.helpers.blockNode.getBlockNodes();

                // Filter out child blocks that are inside list nodes to avoid duplicate content
                // List nodes (orderedList, bulletList) contain paragraph/listItem children
                // We want to show the list node (which already has the text content) and skip its children
                const listTypes = ['orderedList', 'bulletList'];
                const filteredBlocks: any[] = [];
                let skipUntilPos = -1; // Position after which to stop skipping

                for (const b of allBlocks) {
                    const type = b.node.type.name;
                    const pos = b.pos;
                    const endPos = pos + b.node.nodeSize;

                    // If this block is inside a list we're processing, skip it
                    if (pos < skipUntilPos) {
                        continue;
                    }

                    // If this is a list node, mark its children to be skipped
                    if (listTypes.includes(type)) {
                        skipUntilPos = endPos;
                    }

                    filteredBlocks.push(b);
                }

                const totalBlocks = filteredBlocks.length;

                // Apply range filtering
                const start = Math.max(0, startIndex ?? 0);
                const end = Math.min(totalBlocks - 1, endIndex ?? totalBlocks - 1);
                const blocks = filteredBlocks.slice(start, end + 1);

                const rangeInfo = (startIndex !== undefined || endIndex !== undefined)
                    ? `Blocks ${start}-${end} of ${totalBlocks} total`
                    : `${totalBlocks} blocks`;

                let result = `Document Content (${rangeInfo}):\n\n`;

                blocks.forEach((b: any, idx: number) => {
                    const absoluteIndex = start + idx;
                    const type = b.node.type.name;
                    // Truncate long content for readability unless needed
                    const text = b.node.textContent || '(empty)';
                    const truncatedText = text.length > 100 ? text.substring(0, 100) + '...' : text;
                    const id = b.node.attrs.sdBlockId || 'no-id';

                    // Add listLevel info for ordered lists (SuperDoc uses listLevel array for visual numbering)
                    // Only show if values exist to save tokens
                    let orderInfo = '';
                    if (type === 'orderedList') {
                        const listLevel = b.node.attrs.listLevel;
                        const start = b.node.attrs.start;
                        const parts: string[] = [];
                        if (listLevel !== undefined) parts.push(`listLevel: ${JSON.stringify(listLevel)}`);
                        if (start !== undefined) parts.push(`start: ${start}`);
                        if (parts.length > 0) orderInfo = ` [${parts.join(', ')}]`;
                    }

                    result += `[#${absoluteIndex}][ID: ${id}] (${type})${orderInfo} ${truncatedText}\n`;

                    if (includeStyles) {
                        result += '  Styles:';
                        // Block-level attrs
                        const attrs = b.node.attrs;
                        const relevantAttrs = [
                            'textAlign', 'lineHeight', 'indent', 'width', 'height'
                        ].filter(k => attrs[k]);

                        if (relevantAttrs.length > 0) {
                            result += ` Block: { ${relevantAttrs.map(k => `${k}: ${attrs[k]}`).join(', ')} }`;
                        }

                        // Inline styles (scan descendants)
                        const inlineStyles = new Set<string>();
                        b.node.descendants((child: any) => {
                            if (child.isText && child.marks.length) {
                                child.marks.forEach((mark: any) => {
                                    if (mark.type.name === 'textStyle') {
                                        Object.entries(mark.attrs).forEach(([k, v]) => {
                                            inlineStyles.add(`${k}: ${v}`);
                                        });
                                    } else {
                                        inlineStyles.add(mark.type.name);
                                    }
                                });
                            }
                        });

                        if (inlineStyles.size > 0) {
                            result += ` Inline: { ${Array.from(inlineStyles).join(', ')} }`;
                        }
                        result += '\n';
                    }
                });

                return result;
            }
        ),
        createTool(
            'deleteBlock',
            'Delete a specific block (paragraph, heading, list item) by its Block ID. Obtain IDs from `readDocument` first.',
            {
                type: 'object',
                properties: {
                    blockId: { type: 'string', description: 'The sdBlockId of the block to delete.' }
                },
                required: ['blockId'],
                additionalProperties: false
            },
            async ({ blockId }: { blockId: string }) => {
                const editor = getEditor();
                if (!editor) throw new Error('Editor not initialized');

                if (typeof editor.commands.deleteBlockNodeById !== 'function') {
                    return 'Error: `deleteBlockNodeById` command not available.';
                }

                editor.commands.deleteBlockNodeById(blockId);
                return `Deleted block with ID: ${blockId}`;
            }
        ),
        createTool(
            'fixOrderedListNumbering',
            'Fix ordered list numbering after inserting or deleting list items. Call this after any ordered list modification to ensure numbers are sequential (1, 2, 3...) instead of skipped (1, 2, 4...).',
            {
                type: 'object',
                properties: {},
                required: [],
                additionalProperties: false
            },
            async () => {
                const editor = getEditor();
                if (!editor) throw new Error('Editor not initialized');

                // Get all block nodes
                if (!editor.helpers?.blockNode?.getBlockNodes) {
                    return 'Error: BlockNode helpers not available.';
                }

                const allBlocks = editor.helpers.blockNode.getBlockNodes();

                // Filter out child blocks inside list nodes to avoid nested paragraphs
                // breaking our contiguous list detection
                const listTypes = ['orderedList', 'bulletList'];
                const filteredBlocks: any[] = [];
                let skipUntilPos = -1;

                for (const b of allBlocks) {
                    const type = b.node.type.name;
                    const pos = b.pos;
                    const endPos = pos + b.node.nodeSize;

                    if (pos < skipUntilPos) {
                        continue;
                    }

                    if (listTypes.includes(type)) {
                        skipUntilPos = endPos;
                    }

                    filteredBlocks.push(b);
                }


                // Group contiguous orderedList blocks and fix their numbering
                // SuperDoc uses `listLevel` attribute (array like [1], [2], [3]) for visual numbering
                let currentGroupStart: number | null = null;
                let currentGroupIndex = 0;
                let fixedCount = 0;

                // Use a transaction to batch all changes
                let tr = editor.state.tr;
                let hasChanges = false;

                console.log('[fixOrderedListNumbering] Starting fix, total filtered blocks:', filteredBlocks.length);

                for (let i = 0; i < filteredBlocks.length; i++) {
                    const block = filteredBlocks[i];
                    const isOrderedList = block.node.type.name === 'orderedList';

                    if (isOrderedList) {
                        if (currentGroupStart === null) {
                            currentGroupStart = i;
                            currentGroupIndex = 1;
                        } else {
                            currentGroupIndex++;
                        }

                        const pos = block.pos;
                        const currentAttrs = block.node.attrs;

                        // Log current state
                        console.log(`[fixOrderedListNumbering] Block ${i}: orderedList at pos ${pos}, expected index: ${currentGroupIndex}`, currentAttrs);

                        // SuperDoc uses multiple attributes for list numbering:
                        // - listLevel: array like [1], [2], [3] - this is the primary visual numbering
                        // - start: HTML standard attribute
                        // - order: fallback attribute
                        const currentListLevel = Array.isArray(currentAttrs.listLevel) ? currentAttrs.listLevel[0] : currentGroupIndex;
                        const expectedListLevel = [currentGroupIndex];

                        // Check if any attribute needs updating
                        const needsUpdate =
                            currentListLevel !== currentGroupIndex ||
                            currentAttrs.start !== currentGroupIndex ||
                            currentAttrs.order !== currentGroupIndex;

                        if (needsUpdate) {
                            const newAttrs = {
                                ...currentAttrs,
                                listLevel: expectedListLevel,  // SuperDoc's primary numbering attribute
                                start: currentGroupIndex,       // HTML standard
                                order: currentGroupIndex        // Fallback
                            };

                            console.log(`[fixOrderedListNumbering] Updating block ${i} from listLevel=${JSON.stringify(currentAttrs.listLevel)} to ${JSON.stringify(expectedListLevel)}`);

                            tr = tr.setNodeMarkup(pos, undefined, newAttrs, block.node.marks);
                            hasChanges = true;
                            fixedCount++;

                            // Also check for listItem children and update their listLevel
                            block.node.forEach((child: any, offset: number) => {
                                if (child.type.name === 'listItem' || child.type.name === 'paragraph') {
                                    const childPos = pos + 1 + offset; // +1 for entering the parent node
                                    const childAttrs = child.attrs;

                                    if (childAttrs.listLevel || Array.isArray(childAttrs.listLevel)) {
                                        const newChildAttrs = {
                                            ...childAttrs,
                                            listLevel: expectedListLevel
                                        };
                                        console.log(`[fixOrderedListNumbering] Also updating child ${child.type.name} at pos ${childPos}`);
                                        tr = tr.setNodeMarkup(childPos, undefined, newChildAttrs, child.marks);
                                    }
                                }
                            });
                        }
                    } else {
                        // Reset group tracking when hitting non-list block
                        currentGroupStart = null;
                        currentGroupIndex = 0;
                    }
                }

                if (hasChanges) {
                    editor.view.dispatch(tr);
                    console.log(`[fixOrderedListNumbering] Fixed ${fixedCount} items`);
                    return `Fixed numbering for ${fixedCount} ordered list item(s). Updated listLevel attributes.`;
                }

                return 'All ordered list numbering is already correct.';
            }
        ),
        createTool(
            'debugDocumentStructure',
            'Debug tool: Output the full document structure including all nested nodes, positions, and attributes. Use this to investigate document structure issues.',
            {
                type: 'object',
                properties: {
                    startIndex: {
                        type: 'integer',
                        description: 'Starting block index (0-indexed, default: 0)'
                    },
                    endIndex: {
                        type: 'integer',
                        description: 'Ending block index (inclusive, default: 20)'
                    }
                },
                required: [],
                additionalProperties: false
            },
            async ({ startIndex = 0, endIndex = 20 }: { startIndex?: number; endIndex?: number }) => {
                const editor = getEditor();
                if (!editor) throw new Error('Editor not initialized');

                if (!editor.helpers?.blockNode?.getBlockNodes) {
                    return 'Error: BlockNode helpers not available.';
                }

                // Get ALL block nodes without filtering
                const allBlocks = editor.helpers.blockNode.getBlockNodes();
                const blocks = allBlocks.slice(startIndex, endIndex + 1);

                let result = `Debug: Full Document Structure (blocks ${startIndex}-${endIndex} of ${allBlocks.length} total)\n\n`;

                blocks.forEach((b: any, idx: number) => {
                    const absoluteIndex = startIndex + idx;
                    const type = b.node.type.name;
                    const pos = b.pos;
                    const endPos = pos + b.node.nodeSize;
                    const text = (b.node.textContent || '').substring(0, 50);
                    const attrs = b.node.attrs || {};

                    // Format attributes nicely
                    const attrStr = Object.entries(attrs)
                        .filter(([k, v]) => v !== null && v !== undefined && k !== 'sdBlockId')
                        .map(([k, v]) => `${k}:${JSON.stringify(v)}`)
                        .join(', ');

                    result += `[${absoluteIndex}] ${type} @ pos:${pos}-${endPos} (size:${b.node.nodeSize})\n`;
                    result += `     ID: ${attrs.sdBlockId || 'none'}\n`;
                    if (attrStr) {
                        result += `     attrs: {${attrStr}}\n`;
                    }
                    result += `     text: "${text}${text.length >= 50 ? '...' : ''}"\n`;

                    // Check for child nodes
                    const childTypes: string[] = [];
                    b.node.forEach((child: any) => {
                        const childInfo = `${child.type.name}`;
                        const childAttrs = Object.entries(child.attrs || {})
                            .filter(([k, v]) => v !== null && v !== undefined)
                            .slice(0, 3)
                            .map(([k, v]) => `${k}:${JSON.stringify(v).substring(0, 20)}`)
                            .join(',');
                        childTypes.push(childAttrs ? `${childInfo}{${childAttrs}}` : childInfo);
                    });
                    if (childTypes.length > 0) {
                        result += `     children: [${childTypes.join(', ')}]\n`;
                    }
                    result += '\n';
                });

                // Also log to console for easier inspection
                console.log('[debugDocumentStructure]', result);
                console.log('[debugDocumentStructure] Raw blocks:', blocks.slice(0, 10).map((b: any) => ({
                    type: b.node.type.name,
                    pos: b.pos,
                    attrs: b.node.attrs,
                    children: Array.from({ length: b.node.childCount }, (_, i) => ({
                        type: b.node.child(i).type.name,
                        attrs: b.node.child(i).attrs
                    }))
                })));

                return result;
            }
        )
    ];
};
