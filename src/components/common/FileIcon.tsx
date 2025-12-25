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
        return <FileSpreadsheet size={size} className={className} style={{ color: '#1D6F42' }} />;
    }
    if (ext.endsWith('.pdf')) {
        return <FileType size={size} className={className} style={{ color: '#E53935' }} />;
    }
    if (ext.endsWith('.docx') || ext.endsWith('.doc')) {
        return <FileText size={size} className={className} style={{ color: '#2B579A' }} />;
    }
    if (ext.endsWith('.md')) {
        return <FileText size={size} className={className} style={{ color: '#42A5F5' }} />;
    }
    if (ext.endsWith('.txt')) {
        return <FileText size={size} className={className} />;
    }
    return <FileDefaultIcon size={size} className={className} />;
}
