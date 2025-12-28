import { useState, useCallback, useEffect, RefObject } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { CustomDocEditorHandle } from '../CustomDocEditor';

/**
 * Hook for handling file save operations with CustomDocEditor
 * Listens for Cmd+S / Ctrl+S and saves the document to the file system
 */
export function useCustomFileHandler(
    editorRef: RefObject<CustomDocEditorHandle | null>,
    handle: FileSystemFileHandle | undefined,
    fileName: string
) {
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const { isOverwriteEnabled } = useWorkspace();

    const saveFile = useCallback(async () => {
        console.log('[useCustomFileHandler] saveFile called', {
            hasEditorRef: !!editorRef.current,
            hasHandle: !!handle,
            isSaving
        });

        if (!editorRef.current || !handle || isSaving) {
            console.log('[useCustomFileHandler] saveFile skipped - missing requirements');
            return;
        }

        setIsSaving(true);
        setSaveError(null);
        try {
            // Export document using DocxWriter
            console.log('[useCustomFileHandler] Exporting document...');
            const blob = await editorRef.current.export();

            if (!blob) {
                throw new Error('Failed to export document');
            }
            console.log('[useCustomFileHandler] Export successful, blob size:', blob.size);

            if (isOverwriteEnabled && handle) {
                // Verify permission before writing
                const options: FileSystemHandlePermissionDescriptor = { mode: 'readwrite' };
                if ((await handle.queryPermission(options)) !== 'granted') {
                    if ((await handle.requestPermission(options)) !== 'granted') {
                        throw new Error('Permission denied to save file');
                    }
                }

                // Write blob to the local file system
                console.log('[useCustomFileHandler] Writing to file system...');
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();

                console.log(`[useCustomFileHandler] Saved ${fileName} successfully (overwritten)`);
            } else {
                // Trigger download as a new file
                console.log('[useCustomFileHandler] Triggering download as new file...');
                const url = window.URL.createObjectURL(blob);
                const link = document.body.appendChild(document.createElement('a'));
                link.href = url;
                link.download = fileName;
                link.click();
                link.remove();
                window.URL.revokeObjectURL(url);
                console.log(`[useCustomFileHandler] Downloaded ${fileName} successfully`);
            }
        } catch (err) {
            console.error('[useCustomFileHandler] Error saving file:', err);
            setSaveError(`Error saving file: ${(err as Error).message}`);
        } finally {
            setIsSaving(false);
        }
    }, [editorRef, handle, isSaving, fileName, isOverwriteEnabled]);

    useEffect(() => {
        console.log('[useCustomFileHandler] Setting up keydown listener (capture phase)');

        const handleKeyDown = (e: KeyboardEvent) => {
            const isCtrlOrMeta = e.metaKey || e.ctrlKey;
            const isSKey = e.key === 's' || e.key === 'S';
            if (isCtrlOrMeta && isSKey) {
                console.log('[useCustomFileHandler] Cmd+S detected! Preventing default and stopping propagation');
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                saveFile();
                return false;
            }
        };

        // Use capture phase to intercept before other handlers
        window.addEventListener('keydown', handleKeyDown, { capture: true });
        document.addEventListener('keydown', handleKeyDown, { capture: true });

        return () => {
            console.log('[useCustomFileHandler] Removing keydown listeners');
            window.removeEventListener('keydown', handleKeyDown, { capture: true });
            document.removeEventListener('keydown', handleKeyDown, { capture: true });
        };
    }, [saveFile]);

    return { saveFile, isSaving, saveError };
}
