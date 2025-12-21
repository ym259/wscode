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
    activeFileHandle?: FileSystemFileHandle;
    superdoc?: any;
    /** Callback for live cell updates in spreadsheets */
    setCellValue?: (cell: string, value: string | number, sheetName?: string, isNumber?: boolean) => void;
}
