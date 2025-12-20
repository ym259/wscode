'use client';

import React, { useEffect, useState } from 'react';
import styles from './PdfViewer.module.css';

interface PdfViewerProps {
    file: File;
}

export default function PdfViewer({ file }: PdfViewerProps) {
    const [url, setUrl] = useState<string | null>(null);

    useEffect(() => {
        const objectUrl = URL.createObjectURL(file);
        setUrl(objectUrl);

        return () => {
            URL.revokeObjectURL(objectUrl);
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
