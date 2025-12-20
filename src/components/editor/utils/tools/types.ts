export interface ToolDefinition {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: any;
    };
    execute: (args: any) => Promise<any>;
}

export const createTool = (
    name: string,
    description: string,
    parameters: any,
    execute: (args: any) => Promise<any>
): ToolDefinition => ({
    type: 'function',
    function: {
        name,
        description,
        parameters
    },
    execute
});

export interface ToolContext {
    getEditor: () => any;
    getActionMethods: () => any;
    workspaceFiles?: any[];
    activeFilePath?: string;
    superdoc?: any;
}
