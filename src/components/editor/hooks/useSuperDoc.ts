import { useEffect, useRef, useState, useMemo } from 'react';
import { SuperDoc } from '@harbour-enterprises/superdoc';

export function useSuperDoc(
    containerRef: React.RefObject<HTMLDivElement | null>,
    file: File,
    fileName: string
) {
    const superdocRef = useRef<SuperDoc | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const toolbarId = useMemo(() => `toolbar-${Math.random().toString(36).substring(2, 9)}`, []);

    useEffect(() => {
        if (!containerRef.current) return;

        const ext = fileName.toLowerCase();
        if (!ext.endsWith('.docx')) {
            setError(`File type not supported. SuperDoc currently supports .docx files only.`);
            return;
        }

        try {
            superdocRef.current = new SuperDoc({
                selector: containerRef.current,
                toolbar: `#${toolbarId}`,
                document: file,
                documentMode: 'suggesting',
                user: {
                    name: 'User',
                    email: 'user@example.com',
                },
                onReady: () => {
                    setIsReady(true);
                    setError(null);
                },
            });
        } catch (err) {
            console.error('Error initializing SuperDoc:', err);
            setError('Failed to load document. Please try again.');
        }

        return () => {
            // Cleanup if needed
            superdocRef.current = null;
        };
    }, [file, fileName, toolbarId, containerRef]);

    // Suppress known SuperDoc internal errors that we can't fix
    useEffect(() => {
        const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
            // Check if it's the known SuperDoc 'height' error
            if (event.reason?.message?.includes('height') ||
                event.reason?.toString?.()?.includes("reading 'height'")) {
                console.debug('[DocxEditor] Suppressing known SuperDoc internal error:', event.reason?.message || event.reason);
                event.preventDefault(); // Prevent error from appearing in console
            }
        };

        const handleError = (event: ErrorEvent) => {
            // Check if it's the known SuperDoc 'height' error
            if (event.message?.includes('height') ||
                event.message?.includes("reading 'height'")) {
                console.debug('[DocxEditor] Suppressing known SuperDoc internal error:', event.message);
                event.preventDefault();
            }
        };

        window.addEventListener('unhandledrejection', handleUnhandledRejection);
        window.addEventListener('error', handleError);

        return () => {
            window.removeEventListener('unhandledrejection', handleUnhandledRejection);
            window.removeEventListener('error', handleError);
        };
    }, []);

    return { superdocRef, isReady, error, toolbarId };
}
