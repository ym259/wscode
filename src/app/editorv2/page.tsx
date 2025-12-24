'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { WorkspaceProvider, useWorkspace } from '@/contexts/WorkspaceContext';
import { useUniversalAgent } from '@/components/editor/hooks/useUniversalAgent';
import AgentPanel from '@/components/agent/AgentPanel';
import { Sparkles, ChevronRight, ChevronLeft } from 'lucide-react';
import { CustomDocEditorHandle } from '@/components/editor/CustomDocEditor';

// Dynamically import CustomDocEditor to avoid SSR issues
const CustomDocEditor = dynamic(
    () => import('@/components/editor/CustomDocEditor').then(mod => ({ default: mod.CustomDocEditor })),
    {
        ssr: false,
        loading: () => (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                backgroundColor: '#f3f2f1',
            }}>
                <div style={{
                    width: '32px',
                    height: '32px',
                    border: '3px solid #e5e7eb',
                    borderTopColor: '#2b579a',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                }} />
                <span style={{ marginLeft: '12px', color: '#4b5563', fontWeight: 500 }}>Loading editor...</span>
            </div>
        )
    }
);

/**
 * Inner component that uses workspace context
 */
function EditorV2Content() {
    const { setAIActionHandler, setVoiceToolHandler, isPanelOpen, togglePanel } = useWorkspace();
    const [file, setFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Editor ref for useUniversalAgent
    const editorRef = useRef<CustomDocEditorHandle>(null);
    const [editorReady, setEditorReady] = useState(false);

    // Initialize Universal Agent with CustomDocEditor
    useUniversalAgent({
        customEditorRef: editorRef,
        isReady: editorReady,
        activeFilePath: file?.name,
        activeFileType: 'docx',
        workspaceFiles: [],
        setAIActionHandler,
        setVoiceToolHandler,
    });

    // Check if editor is ready - stop once ready
    useEffect(() => {
        if (editorReady) return; // Already ready, no need to check

        const checkEditor = () => {
            if (editorRef.current?.editor) {
                setEditorReady(true);
            }
        };

        // Check periodically until ready
        const interval = setInterval(checkEditor, 100);
        checkEditor(); // Initial check

        return () => clearInterval(interval);
    }, [file, editorReady]);

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
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100vh',
                gap: '8px',
                backgroundColor: '#f3f2f1',
                color: '#dc2626',
                textAlign: 'center',
                padding: '24px',
            }}>
                <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Error Loading Document</h2>
                <p>{error}</p>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100vh',
                gap: '16px',
                backgroundColor: '#f3f2f1',
                color: '#4b5563',
            }}>
                <div style={{
                    width: '32px',
                    height: '32px',
                    border: '3px solid #e5e7eb',
                    borderTopColor: '#2b579a',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                }} />
                <span>Loading sample document...</span>
            </div>
        );
    }

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            backgroundColor: '#f3f2f1',
        }}>
            {/* Header */}
            <header style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 24px',
                backgroundColor: '#ffffff',
                borderBottom: '1px solid #e1dfdd',
                flexShrink: 0,
            }}>
                <h1 style={{ fontSize: '18px', fontWeight: 600, color: '#1f2937', margin: 0 }}>
                    CustomDocEditor Test (v2)
                </h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <span style={{ fontSize: '14px', color: '#6b7280' }}>
                        {file?.name || 'No file loaded'}
                    </span>
                    <button
                        onClick={async () => {
                            if (editorRef.current) {
                                try {
                                    const blob = await editorRef.current.export();
                                    if (blob) {
                                        // Create a new Blob with explicit MIME type
                                        const docxBlob = new Blob([blob], {
                                            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                                        });
                                        const filename = file?.name || 'document.docx';

                                        // Use download link
                                        const url = window.URL.createObjectURL(docxBlob);
                                        const link = document.createElement('a');
                                        link.href = url;
                                        link.setAttribute('download', filename);
                                        document.body.appendChild(link);
                                        link.click();
                                        link.parentNode?.removeChild(link);
                                        window.URL.revokeObjectURL(url);

                                        console.log('[Export] Download triggered:', filename, 'size:', docxBlob.size);
                                    }
                                } catch (error) {
                                    console.error('[Export] Failed:', error);
                                }
                            }
                        }}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 12px',
                            backgroundColor: '#ffffff',
                            color: '#2b579a',
                            border: '1px solid #2b579a',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 500,
                        }}
                    >
                        Export DOCX
                    </button>
                    <button
                        onClick={togglePanel}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 12px',
                            backgroundColor: isPanelOpen ? '#2b579a' : '#ffffff',
                            color: isPanelOpen ? '#ffffff' : '#2b579a',
                            border: '1px solid #2b579a',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 500,
                        }}
                    >
                        <Sparkles size={16} />
                        AI Assistant
                        {isPanelOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {/* Editor */}
                <div style={{ flex: 1, overflow: 'hidden' }}>
                    {file && <CustomDocEditor ref={editorRef} file={file} />}
                </div>

                {/* AI Side Panel - Reuse AgentPanel from main app */}
                {isPanelOpen && (
                    <div style={{
                        width: '400px',
                        flexShrink: 0,
                        borderLeft: '1px solid #e1dfdd',
                        backgroundColor: '#ffffff',
                    }}>
                        <AgentPanel isOpen={isPanelOpen} onClose={togglePanel} />
                    </div>
                )}
            </div>

            {/* Global Styles */}
            <style jsx global>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}

/**
 * EditorV2 Page - Wrapped with WorkspaceProvider to enable AI features
 */
export default function EditorV2Page() {
    return (
        <WorkspaceProvider>
            <EditorV2Content />
        </WorkspaceProvider>
    );
}
