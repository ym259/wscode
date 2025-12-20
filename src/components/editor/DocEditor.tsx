'use client';

import React from 'react';
import DocxEditor from './DocxEditor';
import PdfViewer from './PdfViewer';
import styles from './DocEditor.module.css';

interface DocEditorProps {
    file: File;
    fileName: string;
    handle?: FileSystemFileHandle;
}

export default function DocEditor({ file, fileName, handle }: DocEditorProps) {
    const isDocx = fileName.toLowerCase().endsWith('.docx');
    const isPdf = fileName.toLowerCase().endsWith('.pdf');

    if (isDocx) {
        return <DocxEditor file={file} fileName={fileName} handle={handle} />;
    }

    if (isPdf) {
        return <PdfViewer file={file} />;
    }

    return (
        <div className={styles.error}>
            <p>File type not supported.</p>
            <p className={styles.hint}>Supported formats: .docx, .pdf</p>
        </div>
    );
}
