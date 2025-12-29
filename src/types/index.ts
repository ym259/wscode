/* eslint-disable @typescript-eslint/no-explicit-any */
export interface AttachedSelection {
    text: string;
    fileName: string;
    // Optional: start and end positions if available
    startLine?: number;
    endLine?: number;
}

export interface FileSystemItem {
    name: string;
    path: string;
    type: 'file' | 'directory';
    children?: FileSystemItem[];
    handle?: FileSystemHandle;
    source?: 'filesystem' | 'library';
    content?: string; // For library files that are loaded efficiently
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

// Search result match from searchDocument tool
export interface SearchMatch {
    blockIndex: number;
    text: string;
    relevance: number;
    reason: string;
}

// Union type for ordered message items (can be reasoning or tool call)
export type MessageItem =
    | { type: 'reasoning'; id: string; content: string }
    | { type: 'tool_call'; data: ToolCall }
    | { type: 'search_results'; id: string; matches: SearchMatch[]; query: string };

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    images?: string[]; // Optional array of base64 image strings
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
