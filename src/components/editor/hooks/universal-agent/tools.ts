import {
    ToolContext,
    ToolDefinition,
    getContentTools,
    getFormattingTools,
    getNavigationTools,
    getBlockTools,
    getSpreadsheetTools,
    getReviewTools,
    getSearchTools
} from '@/tools';
import { getLibraryTools } from './library-tools';
import { FileType } from './types';

/**
 * Get tools based on file type
 * 
 * - Read tools: Always available for all file types
 * - Write tools: Available based on what file types are open
 */
export function getToolsForFileType(context: ToolContext, activeFileType: FileType): ToolDefinition[] {
    const tools: ToolDefinition[] = [];

    // READ TOOLS: Always available (can read any file in workspace)
    tools.push(...getNavigationTools(context));        // readFile, keywordSearch
    tools.push(...getSearchTools(context));            // searchDocument (agentic), scrollToBlock
    tools.push(...getSpreadsheetTools(context));       // listSpreadsheetSheets
    tools.push(...getLibraryTools(context));           // readLibraryFile

    // WRITE TOOLS: Based on active file type
    if (activeFileType === 'docx') {
        tools.push(...getContentTools(context));       // insertTrackedChanges, literalReplace, insertTable, etc.
        tools.push(...getFormattingTools(context));    // toggleHeading, toggleBold, etc.
        tools.push(...getBlockTools(context));         // readDocument, deleteBlock, etc.
        tools.push(...getReviewTools(context));        // reviewSection, planParallelReview (parallel sub-agents)
    }

    if (activeFileType === 'xlsx') {
        // Filter content tools for xlsx-specific ones (edit and format)
        const contentTools = getContentTools(context);
        const xlsxWriteTools = contentTools.filter(t =>
            ['editSpreadsheet', 'formatSpreadsheet'].includes(t.function.name)
        );
        tools.push(...xlsxWriteTools);
    }

    return tools;
}
