'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { FileText, Folder, Quote, Copy, Check } from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import styles from './AgentPanel.module.css';

/**
 * Custom code component for syntax highlighting
 */
function CodeBlock({ 
    inline, 
    className, 
    children, 
    ...props 
}: { 
    inline?: boolean; 
    className?: string; 
    children?: React.ReactNode;
    [key: string]: unknown;
}) {
    const [copied, setCopied] = React.useState(false);
    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1] : '';
    const codeString = String(children).replace(/\n$/, '');

    const handleCopy = async () => {
        await navigator.clipboard.writeText(codeString);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (!inline && (match || codeString.includes('\n'))) {
        return (
            <div className={styles.codeBlockWrapper}>
                <div className={styles.codeBlockHeader}>
                    <span className={styles.codeBlockLang}>{language || 'text'}</span>
                    <button 
                        className={styles.codeBlockCopy} 
                        onClick={handleCopy}
                        title={copied ? 'Copied!' : 'Copy code'}
                    >
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                </div>
                <SyntaxHighlighter
                    style={oneDark}
                    language={language || 'text'}
                    PreTag="div"
                    className={styles.codeBlock}
                    customStyle={{
                        margin: 0,
                        borderRadius: '0 0 8px 8px',
                        fontSize: '12px',
                        padding: '12px',
                    }}
                    {...props}
                >
                    {codeString}
                </SyntaxHighlighter>
            </div>
        );
    }

    return (
        <code className={styles.inlineCode} {...props}>
            {children}
        </code>
    );
}

/**
 * Parse content to extract @mentions and selection references
 * Returns an array of segments that are either plain text or special tokens
 */
function parseContent(content: string): Array<{ type: 'text' | 'file' | 'selection'; value: string; extra?: string }> {
    const combinedRegex = /@\[selection from ([^:]+): "([^"]+)"\]|@"([^"]+)"|@([^\s@\[\]"]+)/g;
    const segments: Array<{ type: 'text' | 'file' | 'selection'; value: string; extra?: string }> = [];
    let lastIndex = 0;
    let match;

    while ((match = combinedRegex.exec(content)) !== null) {
        // Add text before the match
        if (match.index > lastIndex) {
            segments.push({ type: 'text', value: content.slice(lastIndex, match.index) });
        }

        if (match[1] && match[2]) {
            // Selection reference: @[selection from filename: "text"]
            segments.push({ type: 'selection', value: match[1], extra: match[2] });
        } else if (match[3] || match[4]) {
            // File mention
            segments.push({ type: 'file', value: match[3] || match[4] });
        }

        lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < content.length) {
        segments.push({ type: 'text', value: content.slice(lastIndex) });
    }

    return segments;
}

/**
 * Render a file or folder mention chip
 */
function FileMention({ path }: { path: string }) {
    // Detect if this is a folder (ends with / or has no file extension)
    const isFolder = path.endsWith('/') || !path.split('/').pop()?.includes('.');
    const displayName = path.replace(/\/$/, '').split('/').pop() || path;
    
    return (
        <span className={`${styles.fileMention} ${isFolder ? styles.folderMention : ''}`}>
            {isFolder ? (
                <Folder size={12} className={styles.fileMentionIcon} />
            ) : (
                <FileText size={12} className={styles.fileMentionIcon} />
            )}
            <span className={styles.fileMentionName}>{displayName}{isFolder ? '/' : ''}</span>
        </span>
    );
}

/**
 * Render a selection mention block
 */
function SelectionMention({ fileName, text }: { fileName: string; text: string }) {
    return (
        <span className={styles.selectionMention}>
            <Quote size={12} className={styles.selectionMentionIcon} />
            <span className={styles.selectionMentionContent}>
                <span className={styles.selectionMentionFile}>{fileName}</span>
                <span className={styles.selectionMentionText}>&quot;{text}&quot;</span>
            </span>
        </span>
    );
}

/**
 * Scroll link component for navigating to document positions
 */
function ScrollLink({ position, children }: { position: number; children: React.ReactNode }) {
    const { setScrollToPositionRequest } = useWorkspace();

    const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setScrollToPositionRequest(position);
    };

    return (
        <button
            type="button"
            onClick={handleClick}
            className={styles.scrollLink}
            title={`文書内の該当箇所へ移動`}
        >
            {/* <MapPin size={12} className={styles.scrollLinkIcon} /> */}
            {children}
        </button>
    );
}

/**
 * Custom link component that handles both scroll links and regular links
 */
function MarkdownLink({ href, children }: { href?: string; children?: React.ReactNode }) {
    // Check if this is a scroll link (scroll://position)
    if (href?.startsWith('scroll://')) {
        const position = parseInt(href.replace('scroll://', ''), 10);
        if (!isNaN(position)) {
            return <ScrollLink position={position}>{children}</ScrollLink>;
        }
    }
    
    // Regular external link
    return (
        <a 
            href={href} 
            target="_blank" 
            rel="noopener noreferrer"
            className={styles.mdLink}
        >
            {children}
        </a>
    );
}

/**
 * Custom URL transform that preserves scroll:// protocol
 * ReactMarkdown sanitizes URLs by default and removes unknown protocols
 */
function urlTransform(url: string): string {
    // Preserve scroll:// protocol for internal navigation
    if (url.startsWith('scroll://')) {
        return url;
    }
    // For other URLs, use default safe protocols
    const safeProtocols = ['http://', 'https://', 'mailto:', 'tel:'];
    if (safeProtocols.some(protocol => url.startsWith(protocol)) || url.startsWith('/') || url.startsWith('#')) {
        return url;
    }
    // Block potentially unsafe protocols
    return '';
}

/**
 * Markdown renderer with scroll link support via custom link component
 */
function MarkdownContent({ content }: { content: string }) {
    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            urlTransform={urlTransform}
            components={{
                // Custom code block handling
                code: CodeBlock as React.ComponentType<React.JSX.IntrinsicElements['code']>,
                // Custom link that handles scroll:// protocol
                a: MarkdownLink,
                // Custom blockquote
                blockquote: ({ children }) => (
                    <blockquote className={styles.mdBlockquote}>
                        {children}
                    </blockquote>
                ),
                // Custom table styling
                table: ({ children }) => (
                    <div className={styles.mdTableWrapper}>
                        <table className={styles.mdTable}>
                            {children}
                        </table>
                    </div>
                ),
                // Custom list styling
                ul: ({ children }) => <ul className={styles.mdList}>{children}</ul>,
                ol: ({ children }) => <ol className={styles.mdList}>{children}</ol>,
                li: ({ children }) => <li className={styles.mdListItem}>{children}</li>,
                // Custom heading styling
                h1: ({ children }) => <h1 className={styles.mdH1}>{children}</h1>,
                h2: ({ children }) => <h2 className={styles.mdH2}>{children}</h2>,
                h3: ({ children }) => <h3 className={styles.mdH3}>{children}</h3>,
                h4: ({ children }) => <h4 className={styles.mdH4}>{children}</h4>,
                // Paragraph styling
                p: ({ children }) => <p className={styles.mdParagraph}>{children}</p>,
                // Horizontal rule
                hr: () => <hr className={styles.mdHr} />,
                // Strong/bold
                strong: ({ children }) => <strong className={styles.mdStrong}>{children}</strong>,
                // Emphasis/italic
                em: ({ children }) => <em className={styles.mdEm}>{children}</em>,
            }}
        >
            {content}
        </ReactMarkdown>
    );
}


/**
 * Renders message content with markdown formatting and colored @mentions for file paths and selections
 */
export function renderMessageContent(content: string): React.ReactNode {
    return <MessageContentRenderer content={content} />;
}

/**
 * Inner component to properly use React hooks
 */
function MessageContentRenderer({ content }: { content: string }): React.ReactNode {
    const segments = React.useMemo(() => parseContent(content), [content]);

    // If no special mentions, render as pure markdown
    if (segments.length === 1 && segments[0].type === 'text') {
        return <MarkdownContent content={content} />;
    }

    // Otherwise, render segments with mentions inline
    return (
        <div className={styles.messageContentWrapper}>
            {segments.map((segment, index) => {
                if (segment.type === 'text') {
                    return <MarkdownContent key={index} content={segment.value} />;
                } else if (segment.type === 'file') {
                    return <FileMention key={index} path={segment.value} />;
                } else if (segment.type === 'selection' && segment.extra) {
                    return <SelectionMention key={index} fileName={segment.value} text={segment.extra} />;
                }
                return null;
            })}
        </div>
    );
}
