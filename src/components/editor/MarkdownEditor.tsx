'use client';

import React, { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Italic, Heading1, Heading2, List } from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import styles from './MarkdownEditor.module.css';
import { DOMParser } from '@tiptap/pm/model';

// Robust Markdown parser for hybrid content
const parseMarkdown = (md: string) => {
    if (!md) return '';

    let html = md;

    // 1. Normalize newlines and hidden characters
    html = html.replace(/\r\n/g, '\n');
    html = html.replace(/\u200b/g, ''); // Remove zero-width spaces

    // 2. Handle HTML-wrapped markdown (e.g. <p># Title</p>) from legacy saves
    // We strip the p tags if they contain markdown headers/lists to let the next regex handle them
    html = html.replace(/<p>(\s*#+\s+.*?)<\/p>/g, '$1\n');
    html = html.replace(/<p>(\s*[-*]\s+.*?)<\/p>/g, '$1\n');

    // 3. Process Markdown syntax
    html = html
        // Headers (At least one space required after #)
        .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')
        .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
        .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
        .replace(/^####\s+(.+)$/gm, '<h4>$1</h4>')
        .replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>')
        .replace(/^######\s+(.+)$/gm, '<h6>$1</h6>')

        // Bold (**text**)
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/__([^_]+)__/g, '<strong>$1</strong>')

        // Italic (*text*)
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/_([^_]+)_/g, '<em>$1</em>')

        // Unordered Lists (- item or * item) (Basic support)
        // Note: This simplistic regex doesn't handle nested lists perfectly but works for flat lists
        .replace(/^\s*[-*]\s+(.+)$/gm, '<ul><li>$1</li></ul>')

        // Fix adjacent list items to be in same ul (merge </ul>\n<ul>)
        .replace(/<\/ul>\s*<ul>/g, '');

    // 4. Wrap remaining plain text lines in <p>
    // We match lines that are NOT headers, lists, or already HTML tags
    const lines = html.split('\n');
    const processedLines = lines.map(line => {
        const trimmed = line.trim();
        if (!trimmed) return '';
        // If line starts with a block tag, assume it's html and don't wrap
        // Tags: <h1-6, <ul, <ol, <li, <blockquote, <pre, <div, <p, <hr
        if (/^<(h[1-6]|ul|ol|li|blockquote|pre|div|p|hr|table)/i.test(trimmed)) return trimmed;
        // Also skip closing tags just in case
        if (/^<\//.test(trimmed)) return trimmed;

        return `<p>${line}</p>`;
    });

    return processedLines.join('');
};

interface MarkdownEditorProps {
    fileKey: string; // The path of the file
    initialContent: string;
    readOnly?: boolean;
}

export default function MarkdownEditor({ fileKey, initialContent, readOnly = false }: MarkdownEditorProps) {
    const { updateLibraryFileContent } = useWorkspace();

    const editor = useEditor({
        extensions: [
            StarterKit,
        ],
        content: parseMarkdown(initialContent),
        editable: !readOnly,
        immediatelyRender: false,
        onUpdate: ({ editor }) => {
            const html = editor.getHTML();
            updateLibraryFileContent(fileKey, html);
        },
        editorProps: {
            attributes: {
                class: styles.editor,
            },
            handlePaste: (view, event) => {
                const text = event.clipboardData?.getData('text/plain');
                if (text) {
                    // Check if it looks like markdown (has #, -, *, etc)
                    // If so, we parse it and insert it as HTML
                    if (/^(#|[-*]\s)/m.test(text)) {
                        const html = parseMarkdown(text);
                        if (html) {
                            // Convert HTML string to ProseMirror Slice
                            const parser = DOMParser.fromSchema(view.state.schema);
                            const element = document.createElement('div');
                            element.innerHTML = html;
                            const slice = parser.parseSlice(element);

                            // Insert slice
                            const tr = view.state.tr.replaceSelection(slice);
                            view.dispatch(tr);
                            return true; // Handled
                        }
                    }
                }
                return false;
            }
        },
    });

    // Update editor content if initialContent changes (e.g. switching tabs)
    useEffect(() => {
        if (editor && initialContent !== editor.getHTML()) {
            editor.commands.setContent(parseMarkdown(initialContent));
        }
    }, [fileKey, initialContent, editor]);

    if (!editor) {
        return null;
    }

    return (
        <div className={styles.container}>
            <div className={styles.toolbar}>
                {/* Basic Toolbar */}
                <button
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    disabled={!editor.can().chain().focus().toggleBold().run()}
                    className={`${styles.toolbarButton} ${editor.isActive('bold') ? styles.active : ''}`}
                    title="Bold"
                >
                    <Bold size={16} />
                </button>
                <button
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    disabled={!editor.can().chain().focus().toggleItalic().run()}
                    className={`${styles.toolbarButton} ${editor.isActive('italic') ? styles.active : ''}`}
                    title="Italic"
                >
                    <Italic size={16} />
                </button>
                <div className={styles.divider} />
                <button
                    onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                    className={`${styles.toolbarButton} ${editor.isActive('heading', { level: 1 }) ? styles.active : ''}`}
                    title="Heading 1"
                >
                    <Heading1 size={16} />
                </button>
                <button
                    onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                    className={`${styles.toolbarButton} ${editor.isActive('heading', { level: 2 }) ? styles.active : ''}`}
                    title="Heading 2"
                >
                    <Heading2 size={16} />
                </button>
                <div className={styles.divider} />
                <button
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    className={`${styles.toolbarButton} ${editor.isActive('bulletList') ? styles.active : ''}`}
                    title="Bullet List"
                >
                    <List size={16} />
                </button>
            </div>
            <div className={styles.content}>
                <EditorContent editor={editor} />
            </div>
        </div>
    );
}
