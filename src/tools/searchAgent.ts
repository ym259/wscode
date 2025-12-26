/**
 * Document Search Tool with Batched Sub-Agents
 * 
 * A tool that searches the document for specific content using parallel sub-agents.
 * Returns a list of block indices that match the query.
 * 
 * @module tools/searchAgent
 */

import OpenAI from 'openai';
import { Agent, Runner, OpenAIProvider } from '@openai/agents';
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, prefer-const */
import { ToolDefinition, ToolContext, createTool } from './types';

// Search result item
export interface SearchResult {
    blockIndex: number;
    text: string;
    relevance: number; // 0-1 score
    reason: string;
}

/**
 * Clean JSON output from potential Markdown formatting
 */
const cleanJsonOutput = (output: string): string => {
    let cleaned = output.trim();
    if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```[a-z]*\n?/i, '');
        cleaned = cleaned.replace(/\n?```$/, '');
    }
    return cleaned;
};

/**
 * Create the search sub-agent
 */
const createSearchAgent = (query: string) => {
    return new Agent({
        name: 'Searcher',
        model: 'gpt-4.1-mini',
        instructions: `You are a search expert. You will receive a section of a document.
Your task is to find parts of the text that are relevant to the user's search query: "${query}"

CRITICAL RULES:
1. Each match must reference ONLY ONE block (one blockIndex)
2. The "text" field must contain text that exists EXACTLY within that single block - do NOT combine text across multiple blocks
3. If a concept spans multiple blocks, return the FIRST block where the key term appears, with text from that block only
4. Keep the "text" field short (under 100 characters) - just enough to identify the match

Return a JSON array of matches. Output ONLY JSON.
Each match should have:
- blockIndex: The block index where the key content appears (e.g., from [#42])
- text: A short snippet FROM THAT SINGLE BLOCK (must exist exactly in that block's content)
- relevance: A score from 0.0 to 1.0 indicating how relevant it is
- reason: Brief explanation why it matches

Input format:
[#blockIndex] (type) Content...

Output format:
[
  {
    "blockIndex": 42,
    "text": "exact text from block 42 only",
    "relevance": 0.9,
    "reason": "..."
  }
]

If no matches found, return []`
    });
};

/**
 * Run a single batch of search
 */
async function runSearchBatch(
    chunks: { startBlock: number; endBlock: number; content: string }[],
    query: string,
    maxConcurrent: number = 5,
    client?: OpenAI
): Promise<{
    results: SearchResult[];
    failedChunks: number;
}> {
    const results: SearchResult[] = [];
    let failedChunks = 0;

    for (let i = 0; i < chunks.length; i += maxConcurrent) {
        const batch = chunks.slice(i, i + maxConcurrent);
        console.log(`[searchDocument] Processing batch ${Math.floor(i / maxConcurrent) + 1}/${Math.ceil(chunks.length / maxConcurrent)}`);

        const batchPromises = batch.map(async (chunk) => {
            try {
                let runner: Runner;
                if (client) {
                    const provider = new OpenAIProvider({ openAIClient: client });
                    runner = new Runner({ modelProvider: provider });
                } else {
                    runner = new Runner();
                }

                const agent = createSearchAgent(query);
                const result = await runner.run(
                    agent,
                    `Search in blocks ${chunk.startBlock}-${chunk.endBlock}:\n\n${chunk.content}`
                );

                const output = result.finalOutput || '';
                let matches: SearchResult[] = [];

                try {
                    const cleaned = cleanJsonOutput(output);
                    const parsed = JSON.parse(cleaned);
                    if (Array.isArray(parsed)) {
                        matches = parsed;
                    }
                } catch (e) {
                    console.warn(`[searchDocument] JSON parse error in chunk ${chunk.startBlock}:`, e);
                }

                return { success: true, data: matches };
            } catch (error) {
                console.error(`[searchDocument] Error in chunk ${chunk.startBlock}:`, error);
                return { success: false, data: null };
            }
        });

        const batchResults = await Promise.all(batchPromises);

        for (const res of batchResults) {
            if (res.success && res.data) {
                results.push(...res.data);
            } else {
                failedChunks++;
            }
        }

        if (i + maxConcurrent < chunks.length) {
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }

    return { results, failedChunks };
}

/**
 * Get search tools
 */
export const getSearchTools = (context: ToolContext): ToolDefinition[] => {
    const { getEditor, openaiConfig } = context;

    return [
        createTool(
            'searchDocument',
            'Search the document for specific content, concepts, or text. Use this when asked "Where is X?" or "Find X". Returns list of relevant blocks.',
            {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'The search query or question'
                    },
                    blocksPerChunk: {
                        type: 'integer',
                        description: 'Blocks per chunk (default: 50)'
                    }
                },
                required: ['query']
            },
            async ({ query, blocksPerChunk = 50 }: { query: string; blocksPerChunk?: number }) => {
                const editor = getEditor();
                if (!editor) throw new Error('Editor not initialized');

                if (!editor.helpers?.blockNode?.getBlockNodes) {
                    return 'Error: BlockNode helpers not available.';
                }

                let client: OpenAI | undefined;
                if (openaiConfig) {
                    try {
                        client = new OpenAI({
                            apiKey: openaiConfig.apiKey,
                            baseURL: openaiConfig.baseURL,
                            dangerouslyAllowBrowser: openaiConfig.dangerouslyAllowBrowser
                        });
                    } catch (e) {
                        console.error('[searchDocument] Failed to create OpenAI client:', e);
                    }
                }

                const allBlocks = editor.helpers.blockNode.getBlockNodes();
                const totalBlocks = allBlocks.length;

                if (totalBlocks === 0) return JSON.stringify({ matches: [] });

                console.log(`[searchDocument] Searching for "${query}" in ${totalBlocks} blocks`);

                const chunks: { startBlock: number; endBlock: number; content: string }[] = [];
                for (let i = 0; i < totalBlocks; i += blocksPerChunk) {
                    const start = i;
                    const end = Math.min(i + blocksPerChunk - 1, totalBlocks - 1);
                    let content = '';
                    for (let j = start; j <= end; j++) {
                        const block = allBlocks[j];
                        content += `[#${j}] (${block.node.type.name}) ${block.node.textContent || ''}\n`;
                    }
                    chunks.push({ startBlock: start, endBlock: end, content });
                }

                const { results, failedChunks } = await runSearchBatch(chunks, query, 5, client);

                // Sort by relevance
                results.sort((a, b) => b.relevance - a.relevance);

                const response = {
                    query,
                    matches: results,
                    totalMatches: results.length,
                    failedChunks,
                    _action: 'search_results' // Signal to UI
                };

                return JSON.stringify(response, null, 2);
            }
        ),
        createTool(
            'scrollToBlock',
            'Scroll the editor to a specific block index and optionally select matching text.',
            {
                type: 'object',
                properties: {
                    blockIndex: {
                        type: 'integer',
                        description: 'The index of the block to scroll to'
                    },
                    matchText: {
                        type: 'string',
                        description: 'Optional text to select/highlight within the block'
                    }
                },
                required: ['blockIndex']
            },
            async ({ blockIndex, matchText }: { blockIndex: number; matchText?: string }) => {
                const editor = getEditor();
                if (!editor) throw new Error('Editor not initialized');

                console.log(`[scrollToBlock] Requested scroll to block ${blockIndex}${matchText ? `, selecting "${matchText.substring(0, 30)}..."` : ''}`);

                // Get block at index
                const blocks = editor.helpers?.blockNode?.getBlockNodes();
                if (!blocks || !blocks[blockIndex]) {
                    console.warn(`[scrollToBlock] Block ${blockIndex} not found. Total blocks: ${blocks?.length}`);
                    return `Error: Block ${blockIndex} not found`;
                }

                const block = blocks[blockIndex];
                const blockEnd = block.pos + block.node.nodeSize;

                // If matchText is provided, find and select it within the block
                if (matchText && matchText.trim()) {
                    const blockText = block.node.textContent || '';
                    const matchIndex = blockText.indexOf(matchText);

                    if (matchIndex !== -1) {
                        // Calculate the absolute position of the match
                        // We need to account for any nested structure within the block
                        let textOffset = 0;
                        let matchFrom = -1;
                        let matchTo = -1;

                        // Walk through the block to find exact positions
                        editor.state.doc.nodesBetween(block.pos, blockEnd, (node: any, pos: number) => {
                            if (node.isText && matchFrom === -1) {
                                const nodeText = node.text || '';
                                const localIndex = nodeText.indexOf(matchText);
                                if (localIndex !== -1) {
                                    matchFrom = pos + localIndex;
                                    matchTo = matchFrom + matchText.length;
                                    return false; // Stop iteration
                                }
                            }
                            return true;
                        });

                        if (matchFrom !== -1 && matchTo !== -1) {
                            console.log(`[scrollToBlock] Selecting text from ${matchFrom} to ${matchTo}`);
                            editor.chain()
                                .focus()
                                .setTextSelection({ from: matchFrom, to: matchTo })
                                .scrollIntoView()
                                .run();

                            return `Scrolled to block ${blockIndex} and selected "${matchText.substring(0, 30)}${matchText.length > 30 ? '...' : ''}"`;
                        }
                    }

                    console.log(`[scrollToBlock] Match text not found in block, falling back to block selection`);
                }

                // Fallback: just scroll to block start
                editor.chain()
                    .focus()
                    .setTextSelection(block.pos + 1) // +1 to get inside the block
                    .scrollIntoView()
                    .run();

                // DOM Scroll Fallback
                try {
                    setTimeout(() => {
                        try {
                            const dom = editor.view.nodeDOM(block.pos);
                            const element = (dom instanceof HTMLElement) ? dom : editor.view.domAtPos(block.pos).node as HTMLElement;

                            if (element && typeof element.scrollIntoView === 'function') {
                                console.log('[scrollToBlock] Triggering DOM scrollIntoView');
                                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                        } catch (e) {
                            console.error('[scrollToBlock] DOM scroll error:', e);
                        }
                    }, 50);
                } catch (e) {
                    console.error('[scrollToBlock] Error in DOM fallback:', e);
                }

                return `Scrolled to block ${blockIndex}`;
            }
        )
    ];
};
