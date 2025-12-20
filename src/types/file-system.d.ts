// File System Access API type declarations
// These APIs are only available in Chromium-based browsers

declare global {
    interface Window {
        showDirectoryPicker: () => Promise<FileSystemDirectoryHandle>;
        showOpenFilePicker: (options?: OpenFilePickerOptions) => Promise<FileSystemFileHandle[]>;
        showSaveFilePicker: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
    }

    interface OpenFilePickerOptions {
        multiple?: boolean;
        excludeAcceptAllOption?: boolean;
        types?: FilePickerAcceptType[];
    }

    interface SaveFilePickerOptions {
        excludeAcceptAllOption?: boolean;
        suggestedName?: string;
        types?: FilePickerAcceptType[];
    }

    interface FilePickerAcceptType {
        description?: string;
        accept: Record<string, string[]>;
    }

    interface FileSystemHandlePermissionDescriptor {
        mode?: 'read' | 'readwrite';
    }

    interface FileSystemHandle {
        kind: 'file' | 'directory';
        name: string;
        isSameEntry(other: FileSystemHandle): Promise<boolean>;
        queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
        requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
    }

    interface FileSystemDirectoryHandle extends FileSystemHandle {
        kind: 'directory';
        entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
        getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>;
        getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
        removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
        resolve(possibleDescendant: FileSystemHandle): Promise<string[] | null>;
    }

    interface FileSystemFileHandle extends FileSystemHandle {
        kind: 'file';
        getFile(): Promise<File>;
        createWritable(options?: { keepExistingData?: boolean }): Promise<FileSystemWritableFileStream>;
    }

    interface FileSystemWritableFileStream extends WritableStream {
        write(data: BufferSource | Blob | string | WriteParams): Promise<void>;
        seek(position: number): Promise<void>;
        truncate(size: number): Promise<void>;
    }

    interface WriteParams {
        type: 'write' | 'seek' | 'truncate';
        data?: BufferSource | Blob | string;
        position?: number;
        size?: number;
    }

    type FileSystemHandle = FileSystemDirectoryHandle | FileSystemFileHandle;
}

export { };
