import { useState, useCallback, useEffect, RefObject } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { SuperDoc } from '@harbour-enterprises/superdoc';

export function useFileHandler(
    superdocRef: RefObject<SuperDoc | null>,
    handle: FileSystemFileHandle | undefined,
    fileName: string
) {
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const { isOverwriteEnabled } = useWorkspace();

    const saveFile = useCallback(async () => {
        console.log('[useFileHandler] saveFile called', {
            hasSuperdoc: !!superdocRef.current,
            hasHandle: !!handle,
            isSaving
        });

        if (!superdocRef.current || !handle || isSaving) {
            console.log('[useFileHandler] saveFile skipped - missing requirements');
            return;
        }

        setIsSaving(true);
        setSaveError(null);
        try {
            // Export document from SuperDoc as a blob (without triggering download)
            console.log('[useFileHandler] Exporting document...');
            const blob = await superdocRef.current.export({ triggerDownload: false });

            if (!blob) {
                throw new Error('Failed to export document');
            }
            console.log('[useFileHandler] Export successful, blob size:', blob.size);

            if (isOverwriteEnabled && handle) {
                // Verify permission before writing
                const options: FileSystemHandlePermissionDescriptor = { mode: 'readwrite' };
                if ((await handle.queryPermission(options)) !== 'granted') {
                    if ((await handle.requestPermission(options)) !== 'granted') {
                        throw new Error('Permission denied to save file');
                    }
                }

                // Write blob to the local file system
                console.log('[useFileHandler] Writing to file system...');
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();

                console.log(`[useFileHandler] Saved ${fileName} successfully (overwritten)`);
            } else {
                // Trigger download as a new file
                console.log('[useFileHandler] Triggering download as new file...');
                const url = window.URL.createObjectURL(blob);
                const link = document.body.appendChild(document.createElement('a'));
                link.href = url;
                link.download = fileName;
                link.click();
                link.remove();
                window.URL.revokeObjectURL(url);
                console.log(`[useFileHandler] Downloaded ${fileName} successfully`);
            }
        } catch (err) {
            console.error('[useFileHandler] Error saving file:', err);
            setSaveError(`Error saving file: ${(err as Error).message}`);
        } finally {
            setIsSaving(false);
        }
    }, [handle, isSaving, fileName, superdocRef, isOverwriteEnabled]);

    useEffect(() => {
        console.log('[useFileHandler] Setting up keydown listener (capture phase)');

        const handleKeyDown = (e: KeyboardEvent) => {
            const isCtrlOrMeta = e.metaKey || e.ctrlKey;
            const isSKey = e.key === 's' || e.key === 'S';
            if (isCtrlOrMeta && isSKey) {
                console.log('[useFileHandler] Cmd+S detected! Preventing default and stopping propagation');
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                saveFile();
                return false;
            }
        };

        // Use capture phase to intercept before SuperDoc's handler
        window.addEventListener('keydown', handleKeyDown, { capture: true });
        document.addEventListener('keydown', handleKeyDown, { capture: true });

        return () => {
            console.log('[useFileHandler] Removing keydown listeners');
            window.removeEventListener('keydown', handleKeyDown, { capture: true });
            document.removeEventListener('keydown', handleKeyDown, { capture: true });
        };
    }, [saveFile]);

    return { saveFile, isSaving, saveError };
}

