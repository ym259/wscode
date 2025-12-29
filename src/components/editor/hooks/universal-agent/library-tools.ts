
import { createTool, ToolContext, ToolDefinition } from '@/tools';

/**
 * Get library tools
 */
export function getLibraryTools(context: ToolContext): ToolDefinition[] {
    const { libraryItems } = context;

    return [
        createTool(
            'readLibraryFile',
            'Read content of a file from the Library',
            {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: 'Name of the library file to read (e.g. "notes.md")'
                    }
                },
                required: ['name']
            },
            async ({ name }: { name: string }) => {
                if (!libraryItems) {
                    return 'Library is not available.';
                }

                const item = libraryItems.find(i => i.name === name);
                if (!item) {
                    // Try case-insensitive
                    const looseMatch = libraryItems.find(i => i.name.toLowerCase() === name.toLowerCase());
                    if (looseMatch) {
                        return looseMatch.content || '(Empty file)';
                    }
                    return `File "${name}" not found in Library. Available files: ${libraryItems.map(i => i.name).join(', ')}`;
                }

                return item.content || '(Empty file)';
            }
        )
    ];
}
