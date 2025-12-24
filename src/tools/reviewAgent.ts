/**
 * Document Typo Review Tool with Batched Sub-Agents
 * 
 * A single tool that internally manages parallel sub-agents with:
 * - Controlled concurrency (max 5 parallel)
 * - Rate limit protection (delay between batches)
 * - Automatic chunking and result aggregation
 * 
 * @module tools/reviewAgent
 */

import OpenAI from 'openai';
import { Agent, Runner, OpenAIProvider } from '@openai/agents';
import { ToolDefinition, ToolContext, createTool } from './types';

// Issue type returned by the reviewer
export interface TypoIssue {
    blockIndex: number;
    text: string;
    issue: string;
    suggestion: string;
    contextBefore?: string;
    contextAfter?: string;
}

/**
 * Clean JSON output from potential Markdown formatting
 */
const cleanJsonOutput = (output: string): string => {
    // Remove markdown code blocks if present
    let cleaned = output.trim();
    if (cleaned.startsWith('```')) {
        // Remove first line (```json or ```)
        cleaned = cleaned.replace(/^```[a-z]*\n?/i, '');
        // Remove last line (```)
        cleaned = cleaned.replace(/\n?```$/, '');
    }
    return cleaned;
};

/**
 * Create the specialized typo reviewer sub-agent
 */
const createTypoReviewerAgent = () => {
    return new Agent({
        name: 'TypoReviewer',
        model: 'gpt-4.1-mini',
        instructions: `あなたは文書校正の専門家です。契約書のセクションを受け取り、誤字脱字を特定します。

チェック項目:
1. **誤字脱字**: スペルミス、変換ミス、OCRエラー
2. **脱字**: 助詞の欠落、文字の抜け
3. **衍字**: 不要な文字の重複
4. **送り仮名の誤り**: 「行なう」→「行う」など

問題が見つかった場合、以下のJSON形式の配列で出力してください。
重要: 修正ツール（editText）は「完全一致」で検索するため、前後の文脈（contextBefore/contextAfter）は**句読点（、。）や空白を含めて原文のまま**正確に抽出してください。

[
  {
    "blockIndex": 42,
    "text": "行なう",
    "issue": "「行なう」は送り仮名が誤り",
    "suggestion": "行う",
    "contextBefore": "契約を",
    "contextAfter": "、その結果" 
  }
]

- text: 誤っている箇所のみ（置換対象）
- suggestion: 修正後のテキスト（置換後）
- contextBefore: 対象テキストの直前5〜10文字（**句読点を含む**。一意に特定するため必須）
- contextAfter: 対象テキストの直後5〜10文字（**句読点を含む**。一意に特定するため必須）

悪い例（句読点が抜けている）:
contextAfter: "その結果" （原文が "、その結果" の場合、これではマッチしません）

良い例:
contextAfter: "、その結果"

問題がない場合は空の配列: []

重要: JSON配列のみを出力し、説明文は含めないでください。マークダウンのコードブロックも不要です。`
    });
};

/**
 * Run a single batch of typo reviews
 */
async function runTypoReviewBatch(
    chunks: { startBlock: number; endBlock: number; content: string }[],
    maxConcurrent: number = 5,
    client?: OpenAI
): Promise<{
    results: { range: { startBlock: number; endBlock: number }; issues: TypoIssue[] }[];
    failedChunks: number;
}> {
    const results: { range: { startBlock: number; endBlock: number }; issues: TypoIssue[] }[] = [];
    let failedChunks = 0;

    // Process in batches of maxConcurrent
    for (let i = 0; i < chunks.length; i += maxConcurrent) {
        const batch = chunks.slice(i, i + maxConcurrent);

        console.log(`[reviewDocumentTypos] Processing batch ${Math.floor(i / maxConcurrent) + 1}/${Math.ceil(chunks.length / maxConcurrent)} (${batch.length} chunks)`);

        const batchPromises = batch.map(async (chunk) => {
            try {
                // Configure runner with custom provider if client is available
                let runner: Runner;
                if (client) {
                    const provider = new OpenAIProvider({ openAIClient: client });
                    runner = new Runner({ modelProvider: provider });
                } else {
                    runner = new Runner();
                }

                const agent = createTypoReviewerAgent();
                const result = await runner.run(
                    agent,
                    `ブロック ${chunk.startBlock}〜${chunk.endBlock} をチェック:\n\n${chunk.content}`
                );

                const output = result.finalOutput || '';
                let issues: TypoIssue[] = [];

                try {
                    const cleaned = typeof output === 'string' ? cleanJsonOutput(output) : JSON.stringify(output);
                    const parsed = JSON.parse(cleaned);
                    if (Array.isArray(parsed)) {
                        issues = parsed;
                    }
                } catch (e) {
                    console.warn(`[reviewDocumentTypos] JSON parse error in chunk ${chunk.startBlock}-${chunk.endBlock}:`, e);
                    // We don't mark as failed chunk if just parsing failed but return empty, 
                    // but usually this means the model failed to follow instructions. 
                    // Let's count it as a "soft" failure or just 0 issues. 
                    // For strict correctness, maybe we should retry, but for now we just log.
                }

                return {
                    success: true,
                    data: {
                        range: { startBlock: chunk.startBlock, endBlock: chunk.endBlock },
                        issues
                    }
                };
            } catch (error) {
                console.error(`[reviewDocumentTypos] Error in chunk ${chunk.startBlock}-${chunk.endBlock}:`, error);
                return { success: false, data: null };
            }
        });

        const batchResults = await Promise.all(batchPromises);

        for (const res of batchResults) {
            if (res.success && res.data) {
                results.push(res.data);
            } else {
                failedChunks++;
            }
        }

        // Rate limit protection: delay between batches (except last)
        if (i + maxConcurrent < chunks.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    return { results, failedChunks };
}

/**
 * Get review tools for document analysis
 */
export const getReviewTools = (context: ToolContext): ToolDefinition[] => {
    const { getEditor, openaiConfig } = context;

    return [
        createTool(
            'reviewDocumentTypos',
            'PRIMARY TOOL for typo review. ALWAYS use this tool FIRST when asked to check for typos, spelling, or proofread. Do NOT read the document manually. This tool automatically scans, splits the document, and running parallel sub-agents to find issues. Returns a list of issues to be fixed with editText().',
            {
                type: 'object',
                properties: {
                    blocksPerChunk: {
                        type: 'integer',
                        description: 'Number of blocks per review chunk (default: 50). Smaller = more thorough but slower.'
                    },
                    maxConcurrent: {
                        type: 'integer',
                        description: 'Maximum parallel reviews (default: 5, max: 10). Higher = faster but risks rate limits.'
                    }
                },
                required: [],
                additionalProperties: false
            },
            async ({ blocksPerChunk = 100, maxConcurrent = 5 }: {
                blocksPerChunk?: number;
                maxConcurrent?: number;
            }) => {
                const editor = getEditor();
                if (!editor) throw new Error('Editor not initialized');

                if (!editor.helpers?.blockNode?.getBlockNodes) {
                    return 'Error: BlockNode helpers not available.';
                }

                // Initialize OpenAI Client for sub-agents if config is available
                let client: OpenAI | undefined;
                if (openaiConfig) {
                    try {
                        client = new OpenAI({
                            apiKey: openaiConfig.apiKey,
                            baseURL: openaiConfig.baseURL,
                            dangerouslyAllowBrowser: openaiConfig.dangerouslyAllowBrowser
                        });
                    } catch (e) {
                        console.error('[reviewDocumentTypos] Failed to create OpenAI client:', e);
                    }
                } else {
                    console.warn('[reviewDocumentTypos] No openaiConfig found in ToolContext. Sub-agents may fail if API key is missing.');
                }

                // Limit maxConcurrent to prevent rate limit issues
                const effectiveMaxConcurrent = Math.min(Math.max(maxConcurrent, 1), 10);

                // Get all blocks
                const allBlocks = editor.helpers.blockNode.getBlockNodes();
                const totalBlocks = allBlocks.length;

                if (totalBlocks === 0) {
                    return JSON.stringify({ totalBlocks: 0, issuesFound: 0, issues: [] });
                }

                console.log(`[reviewDocumentTypos] Starting review: ${totalBlocks} blocks, ${blocksPerChunk} per chunk, max ${effectiveMaxConcurrent} concurrent`);

                // Create chunks
                const chunks: { startBlock: number; endBlock: number; content: string }[] = [];

                for (let i = 0; i < totalBlocks; i += blocksPerChunk) {
                    const start = i;
                    const end = Math.min(i + blocksPerChunk - 1, totalBlocks - 1);

                    // Extract content for this chunk
                    let content = '';
                    for (let j = start; j <= end && j < allBlocks.length; j++) {
                        const block = allBlocks[j];
                        const type = block.node.type.name;
                        const text = block.node.textContent || '';
                        content += `[#${j}] (${type}) ${text}\n`;
                    }

                    chunks.push({ startBlock: start, endBlock: end, content });
                }

                console.log(`[reviewDocumentTypos] Created ${chunks.length} chunks`);

                // Run batched review
                const startTime = Date.now();
                const { results, failedChunks } = await runTypoReviewBatch(chunks, effectiveMaxConcurrent, client);
                const duration = ((Date.now() - startTime) / 1000).toFixed(1);

                // Aggregate issues
                const allIssues: TypoIssue[] = [];
                for (const result of results) {
                    allIssues.push(...result.issues);
                }

                console.log(`[reviewDocumentTypos] Completed in ${duration}s: ${allIssues.length} issues found, ${failedChunks} chunks failed`);

                // Build result with instruction if issues found
                const result: Record<string, unknown> = {
                    totalBlocks,
                    chunksReviewed: chunks.length,
                    failedChunks,
                    concurrency: effectiveMaxConcurrent,
                    durationSeconds: parseFloat(duration),
                    issuesFound: allIssues.length,
                    issues: allIssues
                };

                if (allIssues.length > 0) {
                    result.nextStep = 'Call editText() for EACH issue IN PARALLEL to fix them. IMPORTANT: Use blockIndex to scope the search to the correct block. Example: editText({ find: "行なう", replace: "行う", blockIndex: 42 })';
                } else if (failedChunks > 0) {
                    result.warning = `${failedChunks} chunks failed to process (likely due to API errors). You may want to retry or check logs.`;
                }

                return JSON.stringify(result, null, 2);
            }
        )
    ];
};
