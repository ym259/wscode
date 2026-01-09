'use client';

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Editor, EditorContent } from '@tiptap/react';

interface PagedEditorContentProps {
    editor: Editor | null;
    docAttrs: any;
    trackChangesDisplayMode: 'markup' | 'final';
    isPaged?: boolean;
    onLayoutStatsChange?: (stats: { pageCount: number; visualLineCount: number }) => void;
}

// Convert twips to pixels at 96 DPI
const twipsToPixels = (twips: number): number => (twips / 1440) * 96;

interface PageInfo {
    pageNumber: number;
    contentOffset: number; // Where this page's content starts (offset from top of ProseMirror)
    visibleHeight: number; // Height of content visible on this page (used for clipping)
}

/**
 * Collects all block-level elements that represent visual lines.
 */
function collectBlockElements(container: HTMLElement): HTMLElement[] {
    const blocks: HTMLElement[] = [];

    const walk = (element: HTMLElement) => {
        const tagName = element.tagName.toLowerCase();

        if (tagName === 'p' || tagName === 'li' ||
            tagName === 'h1' || tagName === 'h2' || tagName === 'h3' ||
            tagName === 'h4' || tagName === 'h5' || tagName === 'h6') {
            blocks.push(element);
        }

        if (tagName === 'ol' || tagName === 'ul' || tagName === 'div' ||
            tagName === 'section' || tagName === 'article' || tagName === 'table' ||
            tagName === 'tbody' || tagName === 'thead' || tagName === 'tr' ||
            tagName === 'td' || tagName === 'th' || tagName === 'blockquote') {
            Array.from(element.children).forEach(child => {
                if (child instanceof HTMLElement) {
                    walk(child);
                }
            });
        }
    };

    Array.from(container.children).forEach(child => {
        if (child instanceof HTMLElement) {
            walk(child);
        }
    });

    return blocks;
}

export const PagedEditorContent: React.FC<PagedEditorContentProps> = ({
    editor,
    docAttrs,
    trackChangesDisplayMode,
    isPaged = true,
    onLayoutStatsChange,
}) => {
    const [pages, setPages] = useState<PageInfo[]>([{ pageNumber: 1, contentOffset: 0, visibleHeight: 0 }]);
    const editorContainerRef = useRef<HTMLDivElement>(null);
    const [clonedContent, setClonedContent] = useState<string>('');
    // Ref to hold the latest calculatePages function for recursive setTimeout calls
    const calculatePagesRef = useRef<(() => void) | null>(null);

    // Calculate page dimensions from docAttrs
    const pageWidthTwips = parseInt(docAttrs?.pageSize?.['w:w']) || 12240;
    const pageHeightTwips = parseInt(docAttrs?.pageSize?.['w:h']) || 15840;
    const marginTopTwips = parseInt(docAttrs?.pageMargins?.['w:top']) || 1440;
    const marginRightTwips = parseInt(docAttrs?.pageMargins?.['w:right']) || 1440;
    const marginBottomTwips = parseInt(docAttrs?.pageMargins?.['w:bottom']) || 1440;
    const marginLeftTwips = parseInt(docAttrs?.pageMargins?.['w:left']) || 1440;

    const pageWidth = twipsToPixels(pageWidthTwips);
    const pageHeight = twipsToPixels(pageHeightTwips);
    const marginTop = twipsToPixels(marginTopTwips);
    const marginRight = twipsToPixels(marginRightTwips);
    const marginBottom = twipsToPixels(marginBottomTwips);
    const marginLeft = twipsToPixels(marginLeftTwips);

    // Extract default font size from docDefaults (w:sz is in half-points)
    // The sz element is stored as { "w:val": "21" } where 21 = 10.5pt
    console.log('[PagedEditorContent] docAttrs:', docAttrs);
    console.log('[PagedEditorContent] docDefaults:', docAttrs?.docDefaults);
    console.log('[PagedEditorContent] sz:', docAttrs?.docDefaults?.sz);
    const defaultFontSizeHalfPts = parseInt(
        docAttrs?.docDefaults?.sz?.['w:val'] ||
        docAttrs?.docDefaults?.sz?.['val'] ||
        '0'
    );
    // Convert half-points to pt (divide by 2), default to 10.5pt if not specified
    const defaultFontSizePt = defaultFontSizeHalfPts > 0
        ? defaultFontSizeHalfPts / 2
        : 10.5;
    console.log('[PagedEditorContent] defaultFontSizePt:', defaultFontSizePt);

    // Extract line pitch from docGrid for grid-based line spacing
    // Japanese documents typically use grid-based layout where linePitch defines
    // the vertical distance between lines (in twips, 1 twip = 1/20 pt)
    const linePitchTwips = parseInt(
        docAttrs?.docGrid?.['w:linePitch'] ||
        docAttrs?.docGrid?.['linePitch'] ||
        '0'
    );
    // Calculate line-height multiplier from linePitch
    // If linePitch is specified, convert to pt and divide by font size
    // Otherwise, use a larger default (1.5) for Japanese document compatibility
    let defaultLineHeight: string;
    let paragraphSpacingPt: number;
    if (linePitchTwips > 0) {
        const linePitchPt = linePitchTwips / 20;
        // Line-height as multiplier = linePitch / fontSize
        const lineHeightMultiplier = linePitchPt / defaultFontSizePt;
        defaultLineHeight = lineHeightMultiplier.toFixed(3);
        // Paragraph spacing: In grid-based layout, paragraphs start on new grid lines
        // Add ~25% of line pitch as inter-paragraph spacing to simulate grid snap
        paragraphSpacingPt = linePitchPt * 0.25;
        console.log('[PagedEditorContent] Using docGrid linePitch:', linePitchTwips, 'twips =', linePitchPt, 'pt -> line-height:', defaultLineHeight, ', paragraph-spacing:', paragraphSpacingPt, 'pt');
    } else {
        // Fallback: use 1.5 for better Japanese document compatibility
        // (more generous than 1.15, which is too tight for Japanese fonts)
        defaultLineHeight = '1.5';
        // Default paragraph spacing of ~3pt for Japanese documents
        paragraphSpacingPt = 3;
        console.log('[PagedEditorContent] No docGrid linePitch, using default line-height:', defaultLineHeight);
    }

    const contentAreaHeight = pageHeight - marginTop - marginBottom;
    const pageGap = 32;

    /**
     * Get all visual line rects within a block element.
     * Uses Range and getClientRects() to find each wrapped line's bounding box.
     */
    const getLineRectsInBlock = (block: HTMLElement, containerTop: number): { top: number; bottom: number }[] => {
        const lines: { top: number; bottom: number }[] = [];
        const range = document.createRange();

        // Walk through all text nodes in the block
        const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null);
        let textNode: Text | null;
        let lastLineBottom = -Infinity;
        const lineThreshold = 3; // Pixels threshold to consider same line

        while ((textNode = walker.nextNode() as Text | null)) {
            if (!textNode.textContent || textNode.textContent.trim() === '') continue;

            range.selectNodeContents(textNode);
            const rects = range.getClientRects();

            for (let i = 0; i < rects.length; i++) {
                const rect = rects[i];
                const rectTop = rect.top - containerTop;
                const rectBottom = rect.bottom - containerTop;

                // Check if this is a new line (not same as previous)
                if (rectTop > lastLineBottom - lineThreshold) {
                    lines.push({ top: rectTop, bottom: rectBottom });
                    lastLineBottom = rectBottom;
                } else if (lines.length > 0) {
                    // Extend the current line if needed
                    lines[lines.length - 1].bottom = Math.max(lines[lines.length - 1].bottom, rectBottom);
                    lastLineBottom = lines[lines.length - 1].bottom;
                }
            }
        }

        // If no text nodes, fall back to block rect
        if (lines.length === 0) {
            const blockRect = block.getBoundingClientRect();
            lines.push({
                top: blockRect.top - containerTop,
                bottom: blockRect.bottom - containerTop,
            });
        }

        return lines;
    };

    // Calculate page breaks: find where each page should start based on LINE boundaries
    const calculatePages = useCallback(() => {
        if (!editorContainerRef.current) return;
        if (!isPaged) {
            setPages([{ pageNumber: 1, contentOffset: 0, visibleHeight: 0 }]); // Dummy page for non-paged mode
            return;
        }

        const proseMirror = editorContainerRef.current.querySelector('.ProseMirror') as HTMLElement;
        if (!proseMirror) {
            console.warn('[PagedEditorContent] .ProseMirror element not found');
            return;
        }

        // Wait for content to actually render (has height)
        if (proseMirror.clientHeight < 10) {
            console.warn('[PagedEditorContent] ProseMirror has no height yet, retrying...');
            setTimeout(() => calculatePagesRef.current?.(), 200);
            return;
        }

        const blocks = collectBlockElements(proseMirror);
        console.log(`[PagedEditorContent] Found ${blocks.length} blocks in proseMirror`);

        if (blocks.length === 0) {
            console.warn('[PagedEditorContent] No blocks found, defaulting to 1 page, retrying...');
            // Likely not rendered yet, retry soon
            setTimeout(() => calculatePagesRef.current?.(), 200);
            return;
        }

        const containerRect = proseMirror.getBoundingClientRect();
        const pageList: PageInfo[] = [];
        let currentPageStart = 0;
        let pageNumber = 1;

        // Track total visual lines
        let totalVisualLines = 0;

        // Find the last LINE that completely fits on each page
        for (let i = 0; i < blocks.length; i++) {
            const block = blocks[i];
            const lines = getLineRectsInBlock(block, containerRect.top);

            for (const line of lines) {
                totalVisualLines++;

                // If this line's bottom exceeds the current page's available space
                if (line.bottom > currentPageStart + contentAreaHeight) {
                    // Start a new page from this line's top
                    if (pageNumber === 1) {
                        pageList.push({ pageNumber: 1, contentOffset: 0, visibleHeight: 0 });
                    }

                    pageNumber++;
                    currentPageStart = line.top;
                    pageList.push({ pageNumber, contentOffset: currentPageStart, visibleHeight: 0 });
                }
            }
        }

        // If we never added page 1, add it now
        if (pageList.length === 0) {
            pageList.push({ pageNumber: 1, contentOffset: 0, visibleHeight: contentAreaHeight });
        }

        // Calculate visible height for each page
        // visibleHeight = (offset of next page) - (offset of this page)
        // For the last page, use contentAreaHeight as maximum
        for (let i = 0; i < pageList.length; i++) {
            if (i < pageList.length - 1) {
                pageList[i].visibleHeight = pageList[i + 1].contentOffset - pageList[i].contentOffset;
            } else {
                // Last page: use full content area or remaining content height
                pageList[i].visibleHeight = contentAreaHeight;
            }
        }

        setPages(pageList);
        setClonedContent(proseMirror.innerHTML);
        if (onLayoutStatsChange) {
            onLayoutStatsChange({
                pageCount: pageList.length,
                visualLineCount: totalVisualLines
            });
        }
    }, [contentAreaHeight, isPaged, onLayoutStatsChange]);

    // Keep ref in sync with the latest calculatePages function
    React.useEffect(() => {
        calculatePagesRef.current = calculatePages;
    }, [calculatePages]);

    React.useLayoutEffect(() => {
        if (!isPaged) return;

        // Debounce slightly to avoid thrashing
        const timer = setTimeout(calculatePages, 100);
        window.addEventListener('resize', calculatePages);

        const observer = new MutationObserver(() => {
            requestAnimationFrame(calculatePages);
        });

        if (editorContainerRef.current) {
            observer.observe(editorContainerRef.current, {
                childList: true,
                subtree: true,
                characterData: true,
                attributes: true,
            });
        }

        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', calculatePages);
            observer.disconnect();
        };
    }, [calculatePages, editor, isPaged]);

    React.useLayoutEffect(() => {
        calculatePages();
    }, [docAttrs, calculatePages]);

    // Apply contextual spacing (collapse margins between same-style paragraphs)
    React.useEffect(() => {
        if (!editor || !editorContainerRef.current) return;

        const proseMirrorEl = editorContainerRef.current.querySelector('.ProseMirror');
        if (!proseMirrorEl) return;

        // Find all paragraphs and headings with contextual spacing enabled
        const elements = proseMirrorEl.querySelectorAll('[data-contextual-spacing="1"]');

        elements.forEach((el) => {
            const currentStyleId = el.getAttribute('data-style-id');
            if (!currentStyleId) return;

            // Look at next sibling
            const nextEl = el.nextElementSibling;
            if (!nextEl) return;

            const nextStyleId = nextEl.getAttribute('data-style-id');
            const nextContextual = nextEl.getAttribute('data-contextual-spacing');

            // If next element has same style and also has contextual spacing
            if (nextStyleId === currentStyleId && nextContextual === '1') {
                // Collapse spacing: remove bottom margin of current, top margin of next
                (el as HTMLElement).style.marginBottom = '0';
                (nextEl as HTMLElement).style.marginTop = '0';
            } else {
                // Reset margins if styles don't match (in case content changed)
                // This ensures margins are restored if the next paragraph style changed
                const originalSpacingAfter = el.getAttribute('data-spacing-after');
                const nextSpacingBefore = nextEl.getAttribute('data-spacing-before');

                if (originalSpacingAfter) {
                    const ptValue = parseInt(originalSpacingAfter) / 20;
                    (el as HTMLElement).style.marginBottom = `${ptValue}pt`;
                }
                if (nextSpacingBefore) {
                    const ptValue = parseInt(nextSpacingBefore) / 20;
                    (nextEl as HTMLElement).style.marginTop = `${ptValue}pt`;
                }
            }
        });
    }, [editor, trackChangesDisplayMode]); // Re-run when editor or display mode changes

    return (
        <>
            <div
                id="docx-editor-container"
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: `${pageGap}px`,
                    padding: '24px 0',
                    minHeight: '100%',
                }}
            >
                {/* Page 1 - Contains the actual editable EditorContent */}
                <div
                    style={{
                        position: 'relative',
                        width: `${pageWidth}px`,
                        height: isPaged ? `${pageHeight}px` : 'auto',
                        minHeight: isPaged ? undefined : `${pageHeight}px`,
                        backgroundColor: '#ffffff',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.1)',
                        overflow: isPaged ? 'hidden' : 'visible',
                    }}
                >
                    <PageCorners />

                    {/* Content container - uses clip-path to hide overflow at line boundary */}
                    <div
                        ref={editorContainerRef}
                        className={trackChangesDisplayMode === 'final' ? 'track-changes-final-mode' : ''}
                        style={{
                            position: isPaged ? 'absolute' : 'relative',
                            top: isPaged ? `${marginTop}px` : undefined,
                            left: isPaged ? `${marginLeft}px` : undefined,
                            right: isPaged ? `${marginRight}px` : undefined,
                            marginTop: isPaged ? undefined : `${marginTop}px`,
                            marginLeft: isPaged ? undefined : `${marginLeft}px`,
                            marginRight: isPaged ? undefined : `${marginRight}px`,
                            marginBottom: isPaged ? undefined : `${marginBottom}px`,
                            height: isPaged ? `${contentAreaHeight}px` : 'auto',
                            overflow: isPaged ? 'hidden' : 'visible',
                            // Clip content precisely at the line boundary where page 1 ends
                            clipPath: isPaged && pages[0]?.visibleHeight && pages[0].visibleHeight < contentAreaHeight
                                ? `inset(0 0 ${contentAreaHeight - pages[0].visibleHeight}px 0)`
                                : undefined,
                            // Set document default font size, line-height, and paragraph spacing as CSS custom properties
                            '--doc-default-font-size': `${defaultFontSizePt}pt`,
                            '--doc-default-line-height': defaultLineHeight,
                            '--doc-paragraph-spacing': `${paragraphSpacingPt}pt`,
                        } as React.CSSProperties}
                    >
                        <EditorContent editor={editor} />
                    </div>

                    {isPaged && (
                        <div style={{
                            position: 'absolute',
                            bottom: '8px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            fontSize: '10px',
                            color: '#9ca3af',
                        }}>
                            1
                        </div>
                    )}
                </div>

                {/* Additional pages - show content offset to display the right portion */}
                {
                    isPaged && pages.slice(1).map((pageInfo) => (
                        <div
                            key={pageInfo.pageNumber}
                            style={{
                                position: 'relative',
                                width: `${pageWidth}px`,
                                height: `${pageHeight}px`,
                                backgroundColor: '#ffffff',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.1)',
                                overflow: 'hidden',
                            }}
                        >
                            <PageCorners />

                            <div
                                className={trackChangesDisplayMode === 'final' ? 'track-changes-final-mode' : ''}
                                style={{
                                    position: 'absolute',
                                    top: `${marginTop}px`,
                                    left: `${marginLeft}px`,
                                    right: `${marginRight}px`,
                                    height: `${contentAreaHeight}px`,
                                    overflow: 'hidden',
                                    // Clip content precisely at the line boundary where this page ends
                                    clipPath: pageInfo.visibleHeight < contentAreaHeight
                                        ? `inset(0 0 ${contentAreaHeight - pageInfo.visibleHeight}px 0)`
                                        : undefined,
                                    // Pass CSS variables for consistent styling with page 1
                                    '--doc-paragraph-spacing': `${paragraphSpacingPt}pt`,
                                } as React.CSSProperties}
                            >
                                {/* Cloned content with negative margin to show correct portion */}
                                <div
                                    className="ProseMirror"
                                    style={{
                                        marginTop: `-${pageInfo.contentOffset}px`,
                                        pointerEvents: 'none',
                                        fontSize: `${defaultFontSizePt}pt`,
                                        lineHeight: defaultLineHeight,
                                    }}
                                    dangerouslySetInnerHTML={{ __html: clonedContent }}
                                />
                            </div>

                            <div style={{
                                position: 'absolute',
                                bottom: '8px',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                fontSize: '10px',
                                color: '#9ca3af',
                            }}>
                                {pageInfo.pageNumber}
                            </div>
                        </div>
                    ))
                }

                {
                    isPaged && pages.length > 0 && (
                        <div
                            style={{
                                position: 'fixed',
                                bottom: '16px',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                backgroundColor: 'rgba(0,0,0,0.75)',
                                color: '#fff',
                                padding: '8px 16px',
                                borderRadius: '20px',
                                fontSize: '12px',
                                fontWeight: 500,
                                zIndex: 100,
                                pointerEvents: 'none',
                                backdropFilter: 'blur(4px)',
                            }}
                        >
                            {pages.length} ページ
                        </div>
                    )
                }
            </div>
        </>
    );
};

const PageCorners: React.FC = () => (
    <>
        <div style={{ position: 'absolute', left: '-8px', top: '8px', width: '12px', height: '12px', borderLeft: '1px solid #9ca3af', borderTop: '1px solid #9ca3af', pointerEvents: 'none', zIndex: 5 }} />
        <div style={{ position: 'absolute', right: '-8px', top: '8px', width: '12px', height: '12px', borderRight: '1px solid #9ca3af', borderTop: '1px solid #9ca3af', pointerEvents: 'none', zIndex: 5 }} />
        <div style={{ position: 'absolute', left: '-8px', bottom: '8px', width: '12px', height: '12px', borderLeft: '1px solid #9ca3af', borderBottom: '1px solid #9ca3af', pointerEvents: 'none', zIndex: 5 }} />
        <div style={{ position: 'absolute', right: '-8px', bottom: '8px', width: '12px', height: '12px', borderRight: '1px solid #9ca3af', borderBottom: '1px solid #9ca3af', pointerEvents: 'none', zIndex: 5 }} />
    </>
);
