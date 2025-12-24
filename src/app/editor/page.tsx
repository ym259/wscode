'use client';

import React, { useRef, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import '@harbour-enterprises/superdoc/style.css';

// Dynamically import SuperDoc to avoid SSR issues
const SuperDocComponent = dynamic(
    () => import('@harbour-enterprises/superdoc').then(mod => {
        // Return a component that uses SuperDoc
        return function SuperDocWrapper({
            containerRef,
            file,
            toolbarId,
            onReady
        }: {
            containerRef: React.RefObject<HTMLDivElement | null>;
            file: File;
            toolbarId: string;
            onReady: () => void;
        }) {
            useEffect(() => {
                if (!containerRef.current || !file) return;

                const superdoc = new mod.SuperDoc({
                    selector: containerRef.current,
                    toolbar: `#${toolbarId}`,
                    document: file,
                    documentMode: 'suggesting',
                    user: {
                        name: 'Test User',
                        email: 'test@example.com',
                    },
                    onReady: () => {
                        onReady();
                    },
                });

                return () => {
                    // Cleanup
                };
            }, [containerRef, file, toolbarId, onReady]);

            return null;
        };
    }),
    { ssr: false }
);

export default function EditorPage() {
    const containerRef = useRef<HTMLDivElement>(null);
    const [file, setFile] = useState<File | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const toolbarId = 'superdoc-toolbar';

    // Load sample file on mount
    useEffect(() => {
        async function loadSampleFile() {
            try {
                // Fetch the sample DOCX file from public folder
                const response = await fetch('/ソフトウェア開発及び保守運用業務委託契約書（案）0807.docx');
                if (!response.ok) {
                    throw new Error('Failed to load sample file');
                }
                const blob = await response.blob();
                const sampleFile = new File(
                    [blob],
                    'ソフトウェア開発及び保守運用業務委託契約書（案）0807.docx',
                    { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
                );
                setFile(sampleFile);
            } catch (err) {
                console.error('Error loading sample file:', err);
                setError(err instanceof Error ? err.message : 'Failed to load sample file');
            } finally {
                setIsLoading(false);
            }
        }

        loadSampleFile();
    }, []);

    if (error) {
        return (
            <div style={styles.errorContainer}>
                <h2>Error Loading Document</h2>
                <p>{error}</p>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div style={styles.loadingContainer}>
                <div style={styles.spinner} />
                <span>Loading sample document...</span>
            </div>
        );
    }

    return (
        <div style={styles.wrapper}>
            <header style={styles.header}>
                <h1 style={styles.title}>SuperDoc Test Editor</h1>
                <span style={styles.fileName}>
                    {file?.name || 'No file loaded'}
                </span>
            </header>

            <div id={toolbarId} style={styles.toolbar} />

            <div
                ref={containerRef}
                style={{
                    ...styles.container,
                    opacity: isReady ? 1 : 0,
                }}
            />

            {file && (
                <SuperDocComponent
                    containerRef={containerRef}
                    file={file}
                    toolbarId={toolbarId}
                    onReady={() => setIsReady(true)}
                />
            )}

            {!isReady && file && (
                <div style={styles.loadingOverlay}>
                    <div style={styles.spinner} />
                    <span>Initializing editor...</span>
                </div>
            )}
        </div>
    );
}

const styles: { [key: string]: React.CSSProperties } = {
    wrapper: {
        position: 'relative',
        height: '100vh',
        width: '100vw',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#f5f5f5',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 24px',
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e0e0e0',
    },
    title: {
        fontSize: '18px',
        fontWeight: 600,
        margin: 0,
        color: '#333',
    },
    fileName: {
        fontSize: '14px',
        color: '#666',
    },
    toolbar: {
        minHeight: '48px',
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e0e0e0',
        overflowX: 'auto',
        overflowY: 'hidden',
        whiteSpace: 'nowrap',
    },
    container: {
        flex: 1,
        width: '100%',
        overflowY: 'auto',
        transition: 'opacity 0.3s ease',
    },
    loadingContainer: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        gap: '16px',
        backgroundColor: '#f5f5f5',
        color: '#666',
    },
    loadingOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        backgroundColor: '#f5f5f5',
        color: '#666',
    },
    errorContainer: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        gap: '8px',
        backgroundColor: '#f5f5f5',
        color: '#d32f2f',
        textAlign: 'center',
        padding: '24px',
    },
    spinner: {
        width: '32px',
        height: '32px',
        border: '3px solid #e0e0e0',
        borderTopColor: '#2196f3',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
    },
};
