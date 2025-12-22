import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getContentTools } from './content';

// Simple mock for TipTap Node and Text
class MockNode {
    text: string;
    isText: boolean;
    marks: any[];

    constructor(text: string, isText = true, marks: any[] = []) {
        this.text = text;
        this.isText = isText;
        this.marks = marks;
    }
}

// Mock Editor State
// Mock Editor State
const createMockEditor = (content: string[]) => {
    // Flatten content into an array of nodes (simulating paragraphs/texts)
    const nodes: any[] = [];
    let currentDocPos = 0;

    content.forEach(text => {
        currentDocPos++; // block start
        nodes.push({
            node: new MockNode(text),
            pos: currentDocPos
        });
        currentDocPos += text.length;
        currentDocPos++; // block end
    });

    // Track current selection
    let selection = { from: 0, to: 0 };

    const doc = {
        descendants: (callback: (node: any, pos: number) => boolean) => {
            nodes.forEach(item => {
                callback(item.node, item.pos);
            });
        },
        resolve: (pos: number) => ({
            depth: 1,
            node: () => ({ isBlock: true, textContent: 'mock block' }),
            after: () => pos + 10
        }),
        content: { size: currentDocPos }
    };

    const chainMock = {
        setTextSelection: vi.fn().mockImplementation((range) => {
            selection = range;
            return chainMock;
        }),
        insertContent: vi.fn().mockImplementation((newText) => {
            // Find finding the node that contains the election 'from'
            const targetItem = nodes.find(item =>
                selection.from >= item.pos &&
                selection.from <= item.pos + item.node.text.length
            );

            if (targetItem) {
                // Simple mock update: replace the text of the node
                // (This doesn't handle splitting nodes or partial updates perfectly, 
                // but works for complete replacement of a match)
                targetItem.node.text = newText;
            }
            return chainMock;
        }),
        toggleHeading: vi.fn().mockReturnThis(),
        setBold: vi.fn().mockReturnThis(),
        setItalic: vi.fn().mockReturnThis(),
        setUnderline: vi.fn().mockReturnThis(),
        setStrike: vi.fn().mockReturnThis(),
        setMark: vi.fn().mockReturnThis(),
        run: vi.fn()
    };

    return {
        state: { doc, selection: { from: 0, to: 0 } }, // exposure initial selection
        chain: () => chainMock,
        schema: { marks: { code: true } }
    };
};

describe('editText tool', () => {
    let mockEditor: any;
    let toolContext: any;
    let editText: any;

    beforeEach(() => {
        // Setup document:
        // 1. ABC
        // hello Test
        // 2. DEF
        // hello Test
        const docContent = [
            "1. ABC",
            "hello Test",
            "2. DEF",
            "hello Test"
        ];

        mockEditor = createMockEditor(docContent);

        toolContext = {
            getEditor: () => mockEditor,
            getActionMethods: () => ({}),
            workspaceFiles: [],
            activeFilePath: '/test/doc.docx',
            activeFileHandle: null,
            superdoc: { setDocumentMode: vi.fn() }
        };

        const tools = getContentTools(toolContext);
        editText = tools.find(t => t.function.name === 'editText')!.execute;
    });

    it('should find unique text without context', async () => {
        const result = await editText({ find: 'ABC', replace: 'XYZ' });
        expect(result).toContain('Replaced "ABC" with "XYZ"');

        // Check if editor commands were called correcty
        expect(mockEditor.chain().setTextSelection).toHaveBeenCalled();
        expect(mockEditor.chain().insertContent).toHaveBeenCalledWith('XYZ');
    });

    it('should find first occurrence if no context provided', async () => {
        const result = await editText({ find: 'hello Test', replace: 'FIRST' });

        // Based on our mock structure:
        // "1. ABC" -> pos 1 (len 6) -> end 7
        // "hello Test" -> pos 8 (len 10) -> end 18

        // So first "hello Test" should be at pos 8 (or thereabouts depending on block overhead)

        expect(result).toContain('Replaced "hello Test" with "FIRST"');

        // We verify the selection position to ensure it picked the first one
        const calls = mockEditor.chain().setTextSelection.mock.calls;
        const firstCallArg = calls[0][0];

        // just verifying it found something. The exact logic depends on exact mock pos calculation
        expect(firstCallArg.from).toBeLessThan(20);
    });

    it('should find second occurrence using contextBefore', async () => {
        // "2. DEF" is before the second "hello Test"
        const result = await editText({
            find: 'hello Test',
            replace: 'SECOND',
            contextBefore: '2. DEF'
        });

        expect(result).toContain('Replaced "hello Test" with "SECOND"');

        const calls = mockEditor.chain().setTextSelection.mock.calls;
        // In our simple tests, we reset mocks so this should be the only call
        const selectionArg = calls[0][0];

        // "1. ABC" (6 chars)
        // "hello Test" (10 chars)
        // "2. DEF" (6 chars)
        // "hello Test" (10 chars) -> This is the target

        // It should be later in the document than the first one
        expect(selectionArg.from).toBeGreaterThan(20);
    });

    it('should fail if context is incorrect', async () => {
        const result = await editText({
            find: 'hello Test',
            replace: 'WRONG',
            contextBefore: 'NonExistentContext'
        });

        expect(result).toContain('not found');
        expect(mockEditor.chain().insertContent).not.toHaveBeenCalled();
    });

    it('should support contextAfter', async () => {
        // There is no context after the last "hello Test" in our mock array really, 
        // let's update mock for this specific test or just rely on the first one

        // Let's rely on the first one. "hello Test" is followed by "2. DEF"
        const result = await editText({
            find: 'hello Test',
            replace: 'Start',
            contextAfter: '2. DEF'
        });

        expect(result).toContain('Replaced "hello Test" with "Start"');
        const selectionArg = mockEditor.chain().setTextSelection.mock.calls[0][0];

        // Should be the first occurrence
        expect(selectionArg.from).toBeLessThan(20);
    });
});
