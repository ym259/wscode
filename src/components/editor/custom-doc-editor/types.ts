/* eslint-disable @typescript-eslint/no-explicit-any */
import { Editor } from '@tiptap/react';

export interface PageLayoutUpdate {
    pageSize?: { width?: number; height?: number };
    pageMargins?: { top?: number; right?: number; bottom?: number; left?: number };
}

export interface CustomDocEditorHandle {
    editor: Editor | null;
    getEditor: () => Editor | null;
    setDocumentMode: (mode: 'editing' | 'suggesting') => void;
    export: () => Promise<Blob | null>;
    scrollToBlock: (blockIndex: number) => void;
    getDocAttrs: () => any;
    setPageLayout: (updates: PageLayoutUpdate) => void;
    getPageCount: () => number;
    getVisualLineCount: () => number;
}

export interface CustomDocEditorProps {
    file?: File;
    fileName?: string;
}

export interface Comment {
    id: string;
    author: string;
    date: string;
    content: string;
}

export type TrackChangesDisplayMode = 'markup' | 'final';
