'use client';

import React from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import DocxEditor from './DocxEditor';
import PdfViewer from './PdfViewer';
import XlsxEditor from './XlsxEditor';
import CustomDocEditorWrapper from './CustomDocEditorWrapper';
import styles from './DocEditor.module.css';

interface DocEditorProps {
    file: File;
    fileName: string;
    handle?: FileSystemFileHandle;
}

export default function DocEditor({ file, fileName, handle }: DocEditorProps) {
    const { setDocumentStats } = useWorkspace();
    const isDocx = fileName.toLowerCase().endsWith('.docx');
    const isPdf = fileName.toLowerCase().endsWith('.pdf');
    const isXlsx = fileName.toLowerCase().endsWith('.xlsx');

    // Reset stats when switching documents
    React.useEffect(() => {
        setDocumentStats(null);
    }, [fileName, setDocumentStats]);

    if (isDocx) {
        return <CustomDocEditorWrapper file={file} fileName={fileName} handle={handle} />;
    }

    if (isPdf) {
        return <PdfViewer file={file} fileName={fileName} handle={handle} />;
    }

    if (isXlsx) {
        return <XlsxEditor file={file} fileName={fileName} handle={handle} />;
    }

    return (
        <div className={styles.error}>
            <p>File type not supported.</p>
            <p className={styles.hint}>Supported formats: .docx, .pdf, .xlsx</p>
        </div>
    );
}
