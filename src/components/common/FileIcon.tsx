import React from 'react';
import Image from 'next/image';
import { FileText, File as FileDefaultIcon } from 'lucide-react';

interface FileIconProps {
    fileName: string;
    size?: number;
    className?: string;
}

export default function FileIcon({ fileName, size = 16, className = '' }: FileIconProps) {
    const ext = fileName.toLowerCase();

    if (ext.endsWith('.xlsx') || ext.endsWith('.xls')) {
        return (
            <Image
                src="/icons/xlsx_icon.png"
                alt="xlsx"
                width={size}
                height={size}
                style={{ objectFit: 'contain' }}
                className={className}
            />
        );
    }
    if (ext.endsWith('.pdf')) {
        return (
            <Image
                src="/icons/Icon_pdf_file.png"
                alt="pdf"
                width={size}
                height={size}
                style={{ objectFit: 'contain' }}
                className={className}
            />
        );
    }
    if (ext.endsWith('.docx') || ext.endsWith('.doc')) {
        return (
            <Image
                src="/icons/docx_icon.png"
                alt="docx"
                width={size}
                height={size}
                style={{ objectFit: 'contain' }}
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
