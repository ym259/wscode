/**
 * Check if a text node has a deletion mark (track changes).
 * Used to skip deleted text when searching for content.
 */
export const hasDeletionMark = (node: any): boolean => {
    if (!node.marks?.length) return false;
    return node.marks.some((mark: any) => {
        const markName = mark.type.name.toLowerCase();
        // Check for various deletion mark patterns used by track changes extensions
        return markName.includes('deletion') ||
            markName.includes('delete') ||
            markName.includes('suggestdeletion') ||
            markName === 'diffmarkdeletion' ||
            (markName.includes('trackchange') && mark.attrs?.type === 'deletion') ||
            (markName.includes('suggest') && mark.attrs?.type === 'deletion');
    });
};

/**
 * Find text position in the document, skipping text nodes with deletion marks.
 * Supports context matching to disambiguate repeated text.
 * Returns { from, to } for the first match that satisfies context criteria.
 */
export const findTextPositionExcludingDeletions = (
    doc: any,
    searchText: string,
    options: { contextBefore?: string; contextAfter?: string; debug?: boolean; blockRange?: { from: number; to: number } } = {}
): { from: number; to: number } | null => {
    const { contextBefore, contextAfter, debug, blockRange } = options;
    const normalizedSearch = searchText.toLowerCase();
    const normalizedContextBefore = contextBefore?.toLowerCase();
    const normalizedContextAfter = contextAfter?.toLowerCase();

    // Build flattened text and map to segments
    const segments: Array<{ text: string; pos: number; startIdx: number }> = [];
    let concatenated = '';

    doc.descendants((node: any, pos: number) => {
        // If blockRange is specified, only include text within that range
        if (blockRange) {
            const nodeEnd = pos + (node.nodeSize || 0);
            if (pos >= blockRange.to || nodeEnd <= blockRange.from) {
                return true; // Skip nodes outside the range
            }
        }

        if (node.isText) {
            const isDeleted = hasDeletionMark(node);
            if (!isDeleted) {
                segments.push({
                    text: node.text!,
                    pos,
                    startIdx: concatenated.length
                });
                concatenated += node.text!;
            }
        }
        return true;
    });

    if (debug) {
        console.log('[findTextPosition] text length:', concatenated.length);
        console.log('[findTextPosition] Looking for:', searchText);
        if (contextBefore) console.log('[findTextPosition] Context before:', contextBefore);
        if (contextAfter) console.log('[findTextPosition] Context after:', contextAfter);
    }

    // Helper to map concatenated index to doc position
    const mapToDocPos = (index: number): number => {
        const segment = segments.find(s => index >= s.startIdx && index < s.startIdx + s.text.length);
        if (segment) {
            return segment.pos + (index - segment.startIdx);
        }
        return -1;
    };

    let searchPos = 0;
    while (searchPos < concatenated.length) {
        const idx = concatenated.toLowerCase().indexOf(normalizedSearch, searchPos);
        if (idx === -1) break;

        let match = true;

        // Check Context Before
        if (normalizedContextBefore) {
            // Check if there is enough space before
            if (idx < normalizedContextBefore.length) {
                match = false;
            } else {
                const check = concatenated.substring(idx - normalizedContextBefore.length, idx).toLowerCase();
                if (check !== normalizedContextBefore) match = false;
            }
        }

        // Check Context After
        if (match && normalizedContextAfter) {
            const endMatch = idx + searchText.length;
            // Check if there is enough space after
            if (concatenated.length - endMatch < normalizedContextAfter.length) {
                match = false;
            } else {
                const check = concatenated.substring(endMatch, endMatch + normalizedContextAfter.length).toLowerCase();
                if (check !== normalizedContextAfter) match = false;
            }
        }

        if (match) {
            const startDocPos = mapToDocPos(idx);
            // endDocPos is exclusive, so we find the pos of the last char and add 1
            const endDocPos = mapToDocPos(idx + searchText.length - 1) + 1;

            if (startDocPos !== -1 && endDocPos !== 0) {
                if (debug) console.log(`[findTextPosition] Found at ${startDocPos}-${endDocPos}`);
                return { from: startDocPos, to: endDocPos };
            }
        }

        searchPos = idx + 1;
    }

    if (debug) console.log('[findTextPosition] Text not found in document');
    return null;
};

/**
 * Find position of a tracked change (insertion or deletion) matching the text.
 * Returns { from, to, type } if found, or null.
 */
export const findTrackedChange = (
    doc: any,
    searchText: string,
    action: 'accept' | 'reject',
    options: { contextBefore?: string; contextAfter?: string; debug?: boolean } = {}
): { from: number; to: number; type: 'insertion' | 'deletion' } | null => {
    // Logic:
    // 1. Iterate through all text nodes.
    // 2. Identify nodes that are TRACKED CHANGES (insertion or deletion).
    // 3. Match `searchText` against the content of these nodes.
    // 4. Validate context if provided.

    const { contextBefore, contextAfter, debug } = options;
    const normalizedSearch = searchText.toLowerCase();

    // We need to scan the document and build a "view" of tracked changes.
    // Unlike regular text search, we are looking for specific MARKED regions.

    let found: { from: number; to: number; type: 'insertion' | 'deletion' } | null = null;

    doc.descendants((node: any, pos: number) => {
        if (found) return false; // Stop if found

        if (node.isText) {
            // Check for deletion mark
            const isDeleted = hasDeletionMark(node);
            // Check for insertion mark (often just a specific mark, or standard text that is NOT deleted but has an insertion mark)
            // Implementation detail: SuperDoc might handle insertions effectively as standard text with an 'insertion' mark.
            // For now, let's focus on identifying the mark.
            const insertionMark = node.marks.find((m: any) =>
                m.type.name.includes('insertion') ||
                m.type.name.includes('insert') ||
                (m.type.name.includes('trackchange') && m.attrs?.type === 'insertion')
            );
            const isInserted = !!insertionMark;

            // We are looking for a tracked change.
            if (!isDeleted && !isInserted) return true;

            // Check if text matches
            const textContent = node.text!;
            if (textContent.toLowerCase().includes(normalizedSearch)) {
                // Potential match.
                // Note: This simple check assumes the search text is contained within a SINGLE text node.
                // Complex tracked changes spanning multiple nodes (e.g. bolded partial text) might be trickier.
                // For MVP, we assume the tracked change node contains the search text.

                const idx = textContent.toLowerCase().indexOf(normalizedSearch);
                const startPos = pos + idx;
                const endPos = startPos + searchText.length;

                // Validate context (simplified relative to full text search)
                // We'd need to look at surrounding nodes for context.
                // For now, let's assume if unique match or no context needed.
                found = {
                    from: startPos,
                    to: endPos,
                    type: isDeleted ? 'deletion' : 'insertion'
                };
            }
        }
        return true;
    });

    return found;
};

export const validateEditor = (toolName: string, context: any): void => {
    const { getEditor, superdoc, getActionMethods } = context;
    const editor = getEditor();
    if (!editor) {
        console.error(`[${toolName}] No editor from getEditor(). superdoc:`, superdoc);
        throw new Error(`Editor not available. Cannot execute ${toolName}. Please ensure a DOCX document is open and fully loaded.`);
    }
    // Verify AIActions methods are available
    const actionMethods = getActionMethods();
    if (!actionMethods) {
        // Some tools might not strict require AIActions.insertTrackedChange if they fallback
        // But validateEditor is used where we generally expect things to work or fallback
        // Let's keep it simple.
    }

    // Log editor state for debugging
    console.log(`[${toolName}] Validation passed - editor ready. Editor state:`, {
        hasSelection: !!editor.state?.selection,
        docSize: editor.state?.doc?.content?.size,
        superdocActiveEditor: !!superdoc?.activeEditor,
    });
};
