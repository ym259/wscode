/* eslint-disable @typescript-eslint/no-explicit-any */
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
    libraryItems?: any[];
    activeFilePath?: string;
    activeFileHandle?: FileSystemFileHandle;
    superdoc?: any;
    /** Callback for live cell updates in spreadsheets. Options can be boolean (isNumber) for backwards compat or SetCellValueOptions */
    setCellValue?: (cell: string, value: string | number, sheetName?: string, options?: boolean | { isNumber?: boolean; isFormula?: boolean; style?: Record<string, unknown> }) => void;
    /** Callback to open a file in the editor (switches active file) */
    openFileInEditor?: (path: string) => Promise<boolean>;
    /** Callback to add a new file to the workspace (after creating a new file) */
    addFileToWorkspace?: (handle: FileSystemFileHandle) => void;
    /** OpenAI Configuration for sub-agents */
    openaiConfig?: {
        apiKey: string;
        baseURL: string;
        dangerouslyAllowBrowser?: boolean;
    };
    /** Reference to CustomDocEditor for page layout control */
    getCustomEditorRef?: () => React.RefObject<any> | null;
    /** Callback to register a loaded PDF file_id for injection into next message */
    addLoadedPdfFile?: (file: { file_id: string; filename: string }) => void;
    /** Callback to register a loaded Image file_id for injection into next message */
    addLoadedImageFile?: (file: { file_id: string; filename: string }) => void;
    /** Callback to get the current workbook instance */
    getWorkbook?: () => any;
}
