import { ToolDefinition, createTool, ToolContext } from '../types';
import { validateEditor } from './utils';

export const getTrackedChangesTools = (context: ToolContext): ToolDefinition[] => {
    return [
        createTool(
            'insertTrackedChanges',
            'Suggest edits using track changes. Automatically finds target content.',
            {
                type: 'object',
                properties: { instruction: { type: 'string' } },
                required: ['instruction'],
                additionalProperties: false
            },
            async ({ instruction }: { instruction: string }) => {
                const { getActionMethods } = context;
                const actionMethods = getActionMethods();

                // Fallback for CustomDocEditor (where AIActions might not be initialized)
                if (!actionMethods || typeof actionMethods.insertTrackedChange !== 'function') {
                    return 'This AI-powered tracked changes feature is not available in this editor. Please use the `editText` tool with `trackChanges: true` to make your edits manually based on the instruction.';
                }

                validateEditor('insertTrackedChanges', context);
                try {
                    return await actionMethods.insertTrackedChange(instruction);
                } catch (error) {
                    console.error('[insertTrackedChanges] Error:', error);
                    throw new Error(`Failed to insert tracked changes: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            }
        )
    ];
};
