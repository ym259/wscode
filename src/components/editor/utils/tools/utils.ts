import { FileSystemItem } from '@/types';

// Helper to escape HTML special characters
export const escapeHtml = (text: string): string => {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};

// Helper to recursively find a file by path in workspace
export const findFileHandle = (items: FileSystemItem[], targetPath: string): FileSystemFileHandle | null => {
    const parts = targetPath.split('/');

    const search = (currentItems: FileSystemItem[], pathIndex: number): FileSystemFileHandle | null => {
        for (const item of currentItems) {
            if (item.name === parts[pathIndex]) {
                if (pathIndex === parts.length - 1 && item.type === 'file') {
                    return item.handle as FileSystemFileHandle;
                }
                if (item.children && pathIndex < parts.length - 1) {
                    const result = search(item.children, pathIndex + 1);
                    if (result) return result;
                }
            }
        }
        return null;
    };

    return search(items, 0);
};
