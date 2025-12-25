/* eslint-disable @typescript-eslint/no-explicit-any */
import { RefObject } from 'react';
import { SuperDoc } from '@harbour-enterprises/superdoc';
import { FileSystemItem } from '@/types';

/** Supported file types for the agent */
export type FileType = 'docx' | 'xlsx' | 'txt' | 'pdf' | null;

/** Configuration for universal agent */
export interface UniversalAgentConfig {
    /** Reference to SuperDoc instance (for DOCX editing in main app) */
    superdocRef?: RefObject<SuperDoc | null>;
    /** Reference to CustomDocEditor instance (alternative to SuperDoc for editorv2) */
    customEditorRef?: RefObject<any>;
    /** Whether the editor is ready */
    isReady: boolean;
    /** Active file path */
    activeFilePath?: string;
    /** Active file type */
    activeFileType?: FileType;
    /** Active file handle (for direct file access) */
    activeFileHandle?: FileSystemFileHandle;
    /** Workspace files for cross-file access */
    workspaceFiles?: FileSystemItem[];
    /** Handler setter from WorkspaceContext */
    setAIActionHandler: (handler: any) => void;
    /** Voice tool handler setter from WorkspaceContext */
    setVoiceToolHandler?: (handler: ((name: string, args: Record<string, unknown>) => Promise<string>) | null) => void;
    /** XLSX specific: callback for live cell updates */
    setCellValue?: (cell: string, value: string | number, sheetName?: string, isNumber?: boolean) => void;
    /** Callback to open a file in the editor (switches active file) */
    openFileInEditor?: (path: string) => Promise<boolean>;
}
