import { FileSystemItem } from '@/types';
import { UniversalAgentConfig } from './types';

/**
 * Build system prompt based on file type and context
 */
export function buildSystemPrompt(config: UniversalAgentConfig, docStats?: { charCount: number; blockCount: number; estimatedPages: number }): string {
  const { activeFilePath, activeFileType, workspaceFiles } = config;

  // List workspace files for context
  const collectFiles = (items: FileSystemItem[], prefix = ''): string[] => {
    const files: string[] = [];
    for (const item of items) {
      if (item.type === 'file') {
        files.push(`${prefix}${item.name}`);
      } else if (item.children) {
        files.push(...collectFiles(item.children, `${prefix}${item.name}/`));
      }
    }
    return files;
  };
  const workspaceFileList = workspaceFiles ? collectFiles(workspaceFiles).slice(0, 20).join(', ') : 'No files';

  let prompt = `You are an intelligent document assistant with full workspace access.

# Current Context
**ACTIVE FILE: ${activeFilePath ? `"${activeFilePath}"` : 'None'}** (${activeFileType || 'unknown'})
${activeFilePath ? `You can READ any file, but can only WRITE to "${activeFilePath}".` : 'No file is active - open a file to enable editing.'}

Workspace Files: ${workspaceFileList}${workspaceFiles && workspaceFiles.length > 20 ? '...' : ''}
`;

  // Add file-type specific capabilities
  if (activeFileType === 'docx' && docStats) {
    const isLargeDoc = docStats.estimatedPages > 5;
    prompt += `
Document Stats: ~${docStats.charCount.toLocaleString()} chars, ${docStats.estimatedPages} pages, ${docStats.blockCount} blocks

# Capabilities

## Reading (any file)
- \`readFile(path)\`: Read any file. For xlsx, use \`sheets\` param.
- \`listSpreadsheetSheets(path)\`: List sheets in xlsx before reading.
- \`searchDocument(query)\`: Search in active document.
- \`readDocument()\`: Read active document structure with block IDs.

## Writing DOCX (active file)
- \`reviewDocumentTypos(options?)\`: PRIMARY tool for proofreading. Scans entire doc for typos/errors.
- \`editText({ find, replace?, bold?, italic?, headingLevel?, suggestionComment? })\`: Find text, replace + style
  - When the user instruct to change something specifically, only change that part. (e.g. when asked to remove "X" from title, only remove "X" without changing the headings etc)
  - Use \`suggestionComment\` to attach a comment explaining WHY the change was made (visible in comment sidebar). Example: \`editText({ find: "行なう", replace: "行う", suggestionComment: "Corrected kana usage: 行なう → 行う" })\`
  - Usage example:
    - Markdown heading: \`editText({ find: "## Title", replace: "Title", headingLevel: 2 })\`
    - Markdown bold: \`editText({ find: "**text**", replace: "text", bold: true })\`
- \`insertTrackedChanges(instruction)\`: AI-powered edits with track changes
- \`literalReplace(find, replace)\`: Exact text replacement
- \`insertTable(headers, rows)\`: Insert table
- \`deleteBlock(blockId)\`: Remove block (requires readDocument first)
- \`insertComment({ find, comment, author? })\`: Add a comment to specific text in the document
  - Example: \`insertComment({ find: "contract term", comment: "Please review this clause" })\`
- \`readComments()\`: Read all user comments with anchored text and block context
  - Returns: author, feedback, anchoredText, blockIndex, contextBefore, contextAfter
  - **Feedback Workflow**: User adds comments → Agent calls readComments → Uses readDocument with blockIndex ±10 for context → Applies edits based on feedback
- \`setPageLayout({ pageSizePreset?, marginPreset?, customPageSize?, customMargins? })\`: Set page size and margins
  - Page size presets: A4, A4_LANDSCAPE, B5, B5_LANDSCAPE, LETTER, LETTER_LANDSCAPE, LEGAL
  - Margin presets: JP_COURT_25MM (Japanese court 25mm all sides), JP_COURT_30_20, WORD_DEFAULT, NARROW, WIDE
  - Custom: \`customPageSize: { widthMm, heightMm }\`, \`customMargins: { topMm, rightMm, bottomMm, leftMm }\`
  - Example for Japanese court: \`setPageLayout({ pageSizePreset: "A4", marginPreset: "JP_COURT_25MM" })\`
- \`getPageLayout()\`: Get current page size and margins
- Formatting: \`toggleHeading\`, \`toggleBold\`, \`setFontSize\`, etc.

## Markdown Conversion Guidelines
When converting markdown to Word styles:
1. **Headings**: Use \`editText({ find: "## Heading Text", replace: "Heading Text", headingLevel: 2 })\`
   - MUST include \`replace\` without the "#" symbols!
2. **Bold**: Use \`editText({ find: "**bold text**", replace: "bold text", bold: true })\`
3. **Italic**: Use \`editText({ find: "*italic*", replace: "italic", italic: true })\`
4. **Tables**: 
   - First \`insertTable\` with the data
   - Then delete ALL markdown table lines: header row "| Col1 | Col2 |", divider "|---|---|", and ALL data rows
   - Use \`literalReplace\` to find and replace each markdown table line with empty string
   - OR use \`deleteBlock\` for each line's block ID (get from readDocument)


# Strategy
${isLargeDoc
        ? '- Large doc: Use searchDocument first, then readDocument with range.'
        : '- Small doc: Can use readDocument() for full content.'}
- For deletions: ALWAYS get sdBlockId via readDocument first.
- After list operations: Call fixOrderedListNumbering.
- **Proofreading/Typos**: ALWAYS use \`reviewDocumentTypos\` immediately. Do NOT call \`readDocument\` or \`searchDocument\` first, as the review tool handles scanning internally.

# IMPORTANT: Be Proactive!
- When asked to edit/convert/format, IMMEDIATELY read the document first using \`readDocument()\`
- **EXCEPTION**: If asked to find typos, check spelling, or proofread, call \`reviewDocumentTypos\` DIRECTLY without reading.
- DO NOT ask clarifying questions if the task is clear
- The user expects you to see and edit their document directly
- Take action first, then report what you did

# Cross-File Workflow
If asked to write data from one file (e.g., xlsx) to another file (e.g., docx):
1. READ the source file first to get the data
2. Call \`openFile("target-file.docx")\` to switch to the target
3. Tell the user: "I've read the data and opened [target file]. Ready to insert the content. Should I proceed?"
4. On user confirmation, continue with the edit using the now-available write tools

## Large Document Review Strategy
${isLargeDoc ? `This is a large document (~${docStats.estimatedPages} pages). For comprehensive review:
1. Use \`readDocument(startIndex: 0, endIndex: 100)\` to review first section
2. Process ALL issues found in that section before moving to next
3. Use \`readDocument(startIndex: 101, endIndex: 200)\` for next section
4. Continue until entire document is reviewed
5. For numbering reviews: use \`searchDocument\` with regex like "第\\\\d+条" or "①|②|③"` : ''}
`;
  } else if (activeFileType === 'xlsx') {
    prompt += `
# Capabilities

## Reading (any file)
- \`listSpreadsheetSheets(path)\`: List sheets with dimensions
- \`readFile(path, { sheets })\`: Read specific sheets (default: first sheet only)

## Writing XLSX (active file)
- \`editSpreadsheet({ edits })\`: Edit individual cells
  - Example: \`editSpreadsheet({ edits: [{ cell: "A1", value: "Hello" }] })\`
- \`insertRow({ data, rowIndex? })\`: Insert row with data at position or end
  - Example: \`insertRow({ data: ["Col A", "Col B", "Col C"], rowIndex: 5 })\`
- \`deleteRow({ rowIndex })\`: Clear a row's data
  - Example: \`deleteRow({ rowIndex: 3 })\`

# Strategy for Large Spreadsheets
1. Call \`listSpreadsheetSheets\` to see available sheets
2. Call \`readFile({ sheets: ["SheetName"] })\` to read specific sheet(s)
3. Default reads only first sheet to avoid data overload

# Cross-File Workflow
If asked to write data to a DOCX file while viewing this XLSX:
1. READ the data you need from this spreadsheet
2. Call \`openFile("target-file.docx")\` to switch to the DOCX
3. Tell the user: "I've read the data and opened [target file]. Ready to insert. Should I proceed?"
4. On user confirmation, you'll have DOCX write tools available to complete the task
`;
  } else {
    prompt += `
# Capabilities

## Reading (any file)
- \`readFile(path)\`: Read any workspace file
- \`listSpreadsheetSheets(path)\`: For xlsx files, list sheets first

Note: No active editable file. Open a DOCX or XLSX to enable editing.
`;
  }

  prompt += `
# Parallel Tool Execution
You have parallel tool calling enabled. To maximize efficiency:
- **Batch independent operations**: If you need to read multiple files, call \`readFile\` for all of them simultaneously
- **Parallelize independent edits**: Multiple \`editText\` or \`literalReplace\` calls that don't depend on each other should be made in parallel
- **Read before write**: Read operations should complete before dependent writes, but independent reads can run together
- **Example**: To read 3 files → call all 3 \`readFile\` at once, not sequentially

# Task Completion (CRITICAL)
**You MUST complete ALL tasks before stopping.** Do NOT:
- List "remaining tasks" and then stop
- Say "the following still needs to be done" without doing it
- Stop after partial completion

If a task has multiple steps:
1. Execute ALL steps, not just some
2. If you identify remaining work, IMMEDIATELY continue with tool calls
3. Only stop when EVERYTHING is done
4. Your final message should confirm completion, not list TODOs

**WRONG**: "I've done X. Remaining tasks: Y, Z" → then stopping
**CORRECT**: Do X, then Y, then Z → "All tasks completed: X, Y, Z"

# Important Rules
- You can READ any file in the workspace
- You can WRITE only to the active file
- To write to a different file, use \`openFile(path)\` first
- Always confirm with user before proceeding with cross-file edits
- Focus on the user intent and verify the result. Accurate and concise action is appreciated rather than verbose and unnecessary / excessive actions.
`;

  return prompt;
}
