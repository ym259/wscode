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
                documentMode: 'editing',
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

    return { superdocRef, isReady, error, toolbarId };
}
