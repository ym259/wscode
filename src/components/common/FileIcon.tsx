import React from 'react';
import { FileSpreadsheet, FileType, FileText, File as FileDefaultIcon } from 'lucide-react';

interface FileIconProps {
    fileName: string;
    size?: number;
    className?: string;
}

export default function FileIcon({ fileName, size = 16, className = '' }: FileIconProps) {
    const ext = fileName.toLowerCase();

    if (ext.endsWith('.xlsx') || ext.endsWith('.xls')) {
        return (
            <img
                src="/icons/xlsx_icon.png"
                alt="xlsx"
                style={{ width: size, height: size, objectFit: 'contain' }}
                className={className}
            />
        );
    }
    if (ext.endsWith('.pdf')) {
        return (
            <img
                src="/icons/Icon_pdf_file.png"
                alt="pdf"
                style={{ width: size, height: size, objectFit: 'contain' }}
                className={className}
            />
        );
    }
    if (ext.endsWith('.docx') || ext.endsWith('.doc')) {
        return (
            <img
                src="/icons/docx_icon.png"
                alt="docx"
                style={{ width: size, height: size, objectFit: 'contain' }}
                className={className}
            />
        );
    }
    if (ext.endsWith('.md')) {
        return <FileText size={size} className={className} style={{ color: '#42A5F5' }} />;
    }
    if (ext.endsWith('.txt')) {
        return <FileText size={size} className={className} />;
    }
    return <FileDefaultIcon size={size} className={className} />;
}
