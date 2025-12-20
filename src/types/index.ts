export interface FileSystemItem {
    name: string;
    path: string;
    type: 'file' | 'directory';
    children?: FileSystemItem[];
    handle: FileSystemHandle;
}

export interface EditorTab {
    id: string;
    name: string;
    path: string;
    file?: File;
    isDirty: boolean;
    handle?: FileSystemFileHandle;
}

export interface ToolCall {
    id: string;
    name: string;
    args: any;
    result?: any;
    status: 'success' | 'failure' | 'running';
    timestamp: number;
}

// Union type for ordered message items (can be reasoning or tool call)
export type MessageItem =
    | { type: 'reasoning'; id: string; content: string }
    | { type: 'tool_call'; data: ToolCall };

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    items?: MessageItem[];  // Ordered list of reasoning and tool calls
    // Deprecated: use items instead
    toolCalls?: ToolCall[];
    reasoning?: string;
    timestamp: Date;
}

export type AgentEvent =
    | { type: 'tool_start', id: string, name: string, args: any, timestamp: number }
    | { type: 'tool_result', id: string, result: any, status: 'success' | 'failure', args?: any, timestamp: number }
    | { type: 'content_delta', content: string, timestamp: number }
    | { type: 'reasoning_delta', content: string, timestamp: number }
    | { type: 'run_completed', timestamp: number };

export interface WorkspaceState {
    rootItems: FileSystemItem[];
    openTabs: EditorTab[];
    activeTabId: string | null;
    agentMessages: ChatMessage[];
    isPanelOpen: boolean;
}
