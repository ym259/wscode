import { ToolDefinition, ToolContext } from '../types';
import { getTrackedChangesTools } from './tracked-changes';
import { getCommentsTools } from './comments';
import { getContentInsertTools } from './content-insert';
import { getTextEditTools } from './text-edit';
import { getTableTools } from './table';
import { getSpreadsheetEditTools } from './spreadsheet';
import { getPageLayoutTools } from './page-layout';

export { hasDeletionMark, findTextPositionExcludingDeletions, findTrackedChange } from './utils';

export const getContentTools = (context: ToolContext): ToolDefinition[] => {
    return [
        ...getTrackedChangesTools(context),
        ...getCommentsTools(context),
        ...getContentInsertTools(context),
        ...getTextEditTools(context),
        ...getTableTools(context),
        ...getSpreadsheetEditTools(context),
        ...getPageLayoutTools(context),
    ];
};
