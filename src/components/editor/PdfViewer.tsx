'use client';

import React, { useEffect, useState } from 'react';
import styles from './PdfViewer.module.css';
import { useWorkspace } from '@/contexts/WorkspaceContext';

interface PdfViewerProps {
    file: File;
}

export default function PdfViewer({ file }: PdfViewerProps) {
    const { setDocumentStats } = useWorkspace();
    const [url, setUrl] = useState<string | null>(null);

    useEffect(() => {
        setDocumentStats({
            wordCount: 0,
            charCount: 0,
            lineCount: 0,
            pageCount: 0,
            fileType: 'PDF'
        });

        return () => {
            setDocumentStats(null);
        };
    }, [setDocumentStats]);

    useEffect(() => {
        const objectUrl = URL.createObjectURL(file);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setUrl(objectUrl);

        return () => {
            URL.revokeObjectURL(objectUrl);
            setUrl(null);
        };
    }, [file]);

    if (!url) return null;

    return (
        <div className={styles.wrapper}>
            <embed
                src={url}
                type="application/pdf"
                className={styles.viewer}
            />
        </div>
    );
}
