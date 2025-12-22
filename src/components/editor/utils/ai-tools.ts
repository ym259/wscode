/**
 * AI Tool definitions aggregator
 * @module components/editor/utils/ai-tools
 */

import { SuperDoc } from '@harbour-enterprises/superdoc';
import { AIActions } from '@superdoc-dev/ai';
import { FileSystemItem } from '@/types';
import {
    ToolDefinition,
    ToolContext,
    getContentTools,
    getFormattingTools,
    getNavigationTools,
    getBlockTools,
    getSpreadsheetTools
} from '@/tools';

// Re-export ToolDefinition for consumers
export type { ToolDefinition };

/**
 * Build all tool definitions with the given context
 */
export const getToolDefinitions = (
    actions: AIActions,
    superdoc: SuperDoc,
    workspaceFiles?: FileSystemItem[],
    activeFilePath?: string
): ToolDefinition[] => {
    // Helper to get the TipTap editor instance from SuperDoc
    const getEditor = () => {
        const sd = superdoc as any;
        return sd.activeEditor || sd.editor || sd.getEditor?.() || sd._editor;
    };

    // Helper to get action methods
    const getActionMethods = () => (actions as any).action;

    const context: ToolContext = {
        getActionMethods,
        getEditor,
        workspaceFiles,
        activeFilePath,
        superdoc
    };

    return [
        ...getContentTools(context),
        ...getFormattingTools(context),
        ...getNavigationTools(context),
        ...getBlockTools(context),
        ...getSpreadsheetTools(context)
    ];
};
