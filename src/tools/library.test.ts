
import { describe, it, expect, beforeEach } from 'vitest';
import { getLibraryTools } from '../components/editor/hooks/universal-agent/library-tools';
import { ToolContext } from './types';
import { FileSystemItem } from '@/types';

// Mock types
type MockToolContext = ToolContext & {
    libraryItems: FileSystemItem[];
};

describe('Library Tools', () => {
    let mockContext: MockToolContext;
    let readLibraryFile: (args: { name: string }) => Promise<string>;

    beforeEach(() => {
        mockContext = {
            getEditor: () => null,
            getActionMethods: () => ({}),
            libraryItems: [
                {
                    name: 'notes.md',
                    path: 'library/notes.md',
                    type: 'file',
                    source: 'library',
                    content: '# My Notes\n\nThis is a test note.'
                },
                {
                    name: 'empty.md',
                    path: 'library/empty.md',
                    type: 'file',
                    source: 'library',
                    content: ''
                }
            ]
        };

        const tools = getLibraryTools(mockContext);
        const readTool = tools.find(t => t.function.name === 'readLibraryFile');
        if (!readTool) throw new Error('readLibraryFile tool not found');
        readLibraryFile = readTool.execute;
    });

    it('should read an existing library file', async () => {
        const result = await readLibraryFile({ name: 'notes.md' });
        expect(result).toBe('# My Notes\n\nThis is a test note.');
    });

    it('should handled case-insensitive matching', async () => {
        const result = await readLibraryFile({ name: 'NOTES.md' });
        expect(result).toBe('# My Notes\n\nThis is a test note.');
    });

    it('should return empty message for empty file', async () => {
        const result = await readLibraryFile({ name: 'empty.md' });
        expect(result).toBe('(Empty file)');
    });

    it('should return error message for non-existent file', async () => {
        const result = await readLibraryFile({ name: 'unknown.md' });
        expect(result).toContain('not found in Library');
        expect(result).toContain('Available files: notes.md, empty.md');
    });

    it('should handle missing library items gracefully', async () => {
        mockContext.libraryItems = undefined as any;
        // Re-get tools to bind new context (though context is usually ref)
        // But getLibraryTools reads from context immediately in my implementation?
        // Let's check implementation. Ah, it does `const { libraryItems } = context;`
        // So I need to call getLibraryTools again.

        const tools = getLibraryTools({ ...mockContext, libraryItems: undefined });
        const readTool = tools.find(t => t.function.name === 'readLibraryFile')!;

        const result = await readTool.execute({ name: 'notes.md' });
        expect(result).toBe('Library is not available.');
    });
});
