'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from 'react';
import { Editor } from '@tiptap/react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import {
    Bold, Italic, Underline, Undo2, Redo2,
    AlignLeft, AlignCenter, AlignRight, AlignJustify,
    List, ListOrdered, Grid3x3, Image as ImageIcon, Ruler, FileText,
    IndentIncrease, IndentDecrease, TextQuote, MessageSquare
} from 'lucide-react';
import { ToolbarButton } from './ToolbarButton';
import { ColorPicker } from './ColorPicker';
import { PageLayoutDialog } from './PageLayoutDialog';
import { LineSpacingPicker } from './LineSpacingPicker';
import { OverwriteConfirmationDialog } from './OverwriteConfirmationDialog';
import type { TrackChangesDisplayMode } from '../CustomDocEditor';

interface EditorToolbarProps {
    editor: Editor | null;
    showRuler: boolean;
    onToggleRuler: () => void;
    onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    trackChangesDisplayMode: TrackChangesDisplayMode;
    onTrackChangesDisplayModeChange: (mode: TrackChangesDisplayMode) => void;
    docAttrs?: any;
    onPageLayoutChange?: (updates: {
        pageSize?: { width: number; height: number };
        pageMargins?: { top: number; right: number; bottom: number; left: number };
    }) => void;
    showComments?: boolean;
    onToggleComments?: () => void;
}

/**
 * Main editor toolbar with all formatting controls
 */
export const EditorToolbar: React.FC<EditorToolbarProps> = ({
    editor,
    showRuler,
    onToggleRuler,
    onImageUpload,
    trackChangesDisplayMode,
    onTrackChangesDisplayModeChange,
    docAttrs,
    onPageLayoutChange,
    showComments,
    onToggleComments,
}) => {
    const [showTextColorPicker, setShowTextColorPicker] = useState(false);
    const [showHighlightColorPicker, setShowHighlightColorPicker] = useState(false);
    const [showTablePicker, setShowTablePicker] = useState(false);
    const [tableHoverSize, setTableHoverSize] = useState({ rows: 0, cols: 0 });
    const [showPageLayoutDialog, setShowPageLayoutDialog] = useState(false);
    const [showLineSpacingPicker, setShowLineSpacingPicker] = useState(false);
    const [showOverwriteConfirmDialog, setShowOverwriteConfirmDialog] = useState(false);
    const { isOverwriteEnabled, setIsOverwriteEnabled } = useWorkspace();

    const handleOverwriteToggle = () => {
        if (isOverwriteEnabled) {
            setIsOverwriteEnabled(false);
        } else {
            setShowOverwriteConfirmDialog(true);
        }
    };

    const confirmOverwriteEnable = () => {
        setIsOverwriteEnabled(true);
        setShowOverwriteConfirmDialog(false);
    };

    // Indent/outdent functions
    const handleIndent = () => {
        if (!editor) return;
        const currentIndent = parseInt(editor.getAttributes('paragraph').indent) || 0;
        editor.chain().focus().updateAttributes('paragraph', { indent: currentIndent + 720 }).run(); // 720 twips = 0.5 inch
    };

    const handleOutdent = () => {
        if (!editor) return;
        const currentIndent = parseInt(editor.getAttributes('paragraph').indent) || 0;
        const newIndent = Math.max(0, currentIndent - 720);
        editor.chain().focus().updateAttributes('paragraph', { indent: newIndent || null }).run();
    };

    return (
        <div style={{
            padding: '6px 10px',
            backgroundColor: '#ffffff',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '4px',
            alignItems: 'center',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            borderBottom: '1px solid #e1dfdd',
            zIndex: 10,
        }}>
            {/* History Group */}
            <div style={{ display: 'flex', gap: '1px', paddingRight: '8px', borderRight: '1px solid #e5e7eb', alignItems: 'center' }}>
                <ToolbarButton
                    icon={Undo2}
                    label="Undo (Ctrl+Z)"
                    onClick={() => editor?.chain().focus().undo().run()}
                    isActive={false}
                />
                <ToolbarButton
                    icon={Redo2}
                    label="Redo (Ctrl+Y)"
                    onClick={() => editor?.chain().focus().redo().run()}
                    isActive={false}
                />
            </div>

            {/* Font Family & Size Group */}
            <div style={{ display: 'flex', gap: '4px', paddingRight: '8px', borderRight: '1px solid #e5e7eb', alignItems: 'center' }}>
                <select
                    value={(() => {
                        // Normalize font names from DOCX internal names to display-friendly names
                        const rawFont = editor?.getAttributes('textStyle').fontFamily || '';
                        const fontNormalization: Record<string, string> = {
                            'HiraMinProN-W3': 'Hiragino Mincho ProN',
                            'HiraMinProN-W6': 'Hiragino Mincho ProN',
                            'Hiragino Mincho Pro': 'Hiragino Mincho ProN',
                            'HiraKakuProN-W3': 'Hiragino Kaku Gothic ProN',
                            'HiraKakuProN-W6': 'Hiragino Kaku Gothic ProN',
                            'Hiragino Kaku Gothic Pro': 'Hiragino Kaku Gothic ProN',
                            'ヒラギノ明朝 ProN': 'Hiragino Mincho ProN',
                            'ヒラギノ角ゴ ProN': 'Hiragino Kaku Gothic ProN',
                        };
                        return fontNormalization[rawFont] || rawFont || 'Arial';
                    })()}
                    onChange={(e) => editor?.chain().focus().setFontFamily(e.target.value).run()}
                    style={{
                        height: '28px',
                        padding: '0 6px',
                        borderRadius: '4px',
                        border: '1px solid #d1d5db',
                        fontSize: '13px',
                        cursor: 'pointer',
                        backgroundColor: '#fff',
                        width: '140px',
                        color: '#374151',
                    }}
                    title="Font Family"
                >
                    <option value="Arial">Arial</option>
                    <option value="Times New Roman">Times New Roman</option>
                    <option value="Georgia">Georgia</option>
                    <option value="Verdana">Verdana</option>
                    <option value="Courier New">Courier New</option>
                    <option value="Hiragino Mincho ProN">ヒラギノ明朝 ProN</option>
                    <option value="Hiragino Kaku Gothic ProN">ヒラギノ角ゴ ProN</option>
                    <option value="MS Gothic">MS Gothic</option>
                    <option value="MS Mincho">MS Mincho</option>
                </select>

                <select
                    value={editor?.getAttributes('textStyle').fontSize?.replace('pt', '') || '12'}
                    onChange={(e) => editor?.chain().focus().setFontSize(`${e.target.value}pt`).run()}
                    style={{
                        height: '28px',
                        padding: '0 6px',
                        borderRadius: '4px',
                        border: '1px solid #d1d5db',
                        fontSize: '13px',
                        cursor: 'pointer',
                        backgroundColor: '#fff',
                        width: '64px',
                        color: '#374151',
                    }}
                    title="Font Size"
                >
                    {['8', '9', '10', '10.5', '11', '12', '14', '16', '18', '20', '24', '28', '36', '48', '72'].map(size => (
                        <option key={size} value={size}>{size}</option>
                    ))}
                </select>
            </div>

            {/* Basic Formatting & Colors Group */}
            <div style={{ display: 'flex', gap: '1px', paddingRight: '8px', borderRight: '1px solid #e5e7eb', alignItems: 'center' }}>
                <ToolbarButton
                    icon={Bold}
                    label="Bold (Ctrl+B)"
                    onClick={() => editor?.chain().focus().toggleBold().run()}
                    isActive={editor?.isActive('bold') ?? false}
                />
                <ToolbarButton
                    icon={Italic}
                    label="Italic (Ctrl+I)"
                    onClick={() => editor?.chain().focus().toggleItalic().run()}
                    isActive={editor?.isActive('italic') ?? false}
                />
                <ToolbarButton
                    icon={Underline}
                    label="Underline (Ctrl+U)"
                    onClick={() => editor?.chain().focus().toggleUnderline().run()}
                    isActive={editor?.isActive('underline') ?? false}
                />

                <div style={{ width: '4px' }}></div>

                {/* Text Color Button */}
                <div style={{ position: 'relative' }}>
                    <button
                        onClick={() => {
                            setShowTextColorPicker(!showTextColorPicker);
                            setShowHighlightColorPicker(false);
                            setShowTablePicker(false);
                            setShowLineSpacingPicker(false);
                        }}
                        style={{
                            width: '28px',
                            height: '28px',
                            padding: '4px',
                            border: '1px solid transparent', // Consistent with ToolbarButton
                            borderRadius: '4px',
                            cursor: 'pointer',
                            backgroundColor: showTextColorPicker ? '#e5e7eb' : 'transparent',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'background-color 0.1s ease',
                        }}
                        onMouseEnter={e => {
                            if (!showTextColorPicker) e.currentTarget.style.backgroundColor = '#f3f4f6';
                        }}
                        onMouseLeave={e => {
                            if (!showTextColorPicker) e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                        title="Text Color"
                    >
                        <span style={{ fontSize: '13px', fontWeight: 'bold', lineHeight: 1, color: '#374151' }}>A</span>
                        <div style={{
                            width: '14px',
                            height: '3px',
                            backgroundColor: editor?.getAttributes('textStyle').color || '#000000',
                            borderRadius: '1px',
                            marginTop: '1px',
                        }} />
                    </button>
                    <ColorPicker
                        isOpen={showTextColorPicker}
                        onClose={() => setShowTextColorPicker(false)}
                        onSelectColor={(color) => editor?.chain().focus().setColor(color).run()}
                        onClearColor={() => editor?.chain().focus().unsetColor().run()}
                        clearLabel="No Color"
                    />
                </div>

                {/* Highlight Color Button */}
                <div style={{ position: 'relative' }}>
                    <button
                        onClick={() => {
                            setShowHighlightColorPicker(!showHighlightColorPicker);
                            setShowTextColorPicker(false);
                            setShowTablePicker(false);
                            setShowLineSpacingPicker(false);
                        }}
                        style={{
                            width: '28px',
                            height: '28px',
                            padding: '4px',
                            border: '1px solid transparent',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            backgroundColor: showHighlightColorPicker ? '#e5e7eb' : 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'background-color 0.1s ease',
                        }}
                        onMouseEnter={e => {
                            if (!showHighlightColorPicker) e.currentTarget.style.backgroundColor = '#f3f4f6';
                        }}
                        onMouseLeave={e => {
                            if (!showHighlightColorPicker) e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                        title="Highlight Color"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m9 11-6 6v3h9l3-3" />
                            <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
                        </svg>
                        <div style={{
                            position: 'absolute',
                            bottom: '4px',
                            left: '5px',
                            right: '5px',
                            height: '2px',
                            backgroundColor: editor?.getAttributes('highlight').color || '#ffff00',
                            borderRadius: '1px',
                        }} />
                    </button>
                    <ColorPicker
                        isOpen={showHighlightColorPicker}
                        onClose={() => setShowHighlightColorPicker(false)}
                        onSelectColor={(color) => editor?.chain().focus().toggleHighlight({ color }).run()}
                        onClearColor={() => editor?.chain().focus().unsetHighlight().run()}
                        clearLabel="No Highlight"
                    />
                </div>
            </div>

            {/* Paragraph Formatting Group */}
            <div style={{ display: 'flex', gap: '1px', paddingRight: '8px', borderRight: '1px solid #e5e7eb', alignItems: 'center' }}>
                <ToolbarButton
                    icon={AlignLeft}
                    label="Align Left"
                    onClick={() => editor?.chain().focus().setTextAlign('left').run()}
                    isActive={editor?.isActive({ textAlign: 'left' }) ?? false}
                />
                <ToolbarButton
                    icon={AlignCenter}
                    label="Align Center"
                    onClick={() => editor?.chain().focus().setTextAlign('center').run()}
                    isActive={editor?.isActive({ textAlign: 'center' }) ?? false}
                />
                <ToolbarButton
                    icon={AlignRight}
                    label="Align Right"
                    onClick={() => editor?.chain().focus().setTextAlign('right').run()}
                    isActive={editor?.isActive({ textAlign: 'right' }) ?? false}
                />
                <ToolbarButton
                    icon={AlignJustify}
                    label="Justify"
                    onClick={() => editor?.chain().focus().setTextAlign('justify').run()}
                    isActive={editor?.isActive({ textAlign: 'justify' }) ?? false}
                />

                <div style={{ width: '4px' }}></div>

                <ToolbarButton
                    icon={List}
                    label="Bullet List"
                    onClick={() => editor?.chain().focus().toggleBulletList().run()}
                    isActive={editor?.isActive('bulletList') ?? false}
                />
                <ToolbarButton
                    icon={ListOrdered}
                    label="Numbered List"
                    onClick={() => editor?.chain().focus().toggleOrderedList().run()}
                    isActive={editor?.isActive('orderedList') ?? false}
                />

                <div style={{ width: '4px' }}></div>

                <ToolbarButton
                    icon={IndentDecrease}
                    label="インデントを減らす"
                    onClick={handleOutdent}
                    isActive={false}
                />
                <ToolbarButton
                    icon={IndentIncrease}
                    label="インデントを増やす"
                    onClick={handleIndent}
                    isActive={false}
                />
                {/* Line Spacing Button */}
                <div style={{ position: 'relative' }}>
                    <button
                        onClick={() => {
                            setShowLineSpacingPicker(!showLineSpacingPicker);
                            setShowTextColorPicker(false);
                            setShowHighlightColorPicker(false);
                            setShowTablePicker(false);
                        }}
                        style={{
                            width: '28px',
                            height: '28px',
                            padding: '4px',
                            border: '1px solid transparent',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            backgroundColor: showLineSpacingPicker ? '#e5e7eb' : 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.1s',
                        }}
                        onMouseEnter={e => {
                            if (!showLineSpacingPicker) e.currentTarget.style.backgroundColor = '#f3f4f6';
                        }}
                        onMouseLeave={e => {
                            if (!showLineSpacingPicker) e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                        title="行間"
                    >
                        <TextQuote size={16} color="#374151" />
                    </button>
                    <LineSpacingPicker
                        isOpen={showLineSpacingPicker}
                        onClose={() => setShowLineSpacingPicker(false)}
                        editor={editor}
                    />
                </div>
            </div>

            {/* Insert Group */}
            <div style={{ display: 'flex', gap: '1px', paddingRight: '8px', borderRight: '1px solid #e5e7eb', alignItems: 'center' }}>
                <div style={{ position: 'relative' }}>
                    <ToolbarButton
                        isActive={showTablePicker}
                        onClick={() => {
                            setShowTablePicker(!showTablePicker);
                            setShowTextColorPicker(false);
                            setShowHighlightColorPicker(false);
                            setShowLineSpacingPicker(false);
                        }}
                        icon={Grid3x3}
                        label="表を挿入"
                    />
                    {showTablePicker && (
                        <div
                            style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                marginTop: '4px',
                                backgroundColor: '#fff',
                                border: '1px solid #d1d5db',
                                borderRadius: '6px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                padding: '12px',
                                zIndex: 100,
                            }}
                            onMouseLeave={() => setTableHoverSize({ rows: 0, cols: 0 })}
                        >
                            <div style={{
                                fontSize: '12px',
                                color: '#4b5563',
                                marginBottom: '8px',
                                textAlign: 'center',
                                fontWeight: 500,
                            }}>
                                {tableHoverSize.rows > 0 && tableHoverSize.cols > 0
                                    ? `${tableHoverSize.cols} × ${tableHoverSize.rows}`
                                    : '表のサイズを選択'}
                            </div>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(10, 1fr)',
                                gap: '2px',
                            }}>
                                {Array.from({ length: 10 }).map((_, rowIndex) =>
                                    Array.from({ length: 10 }).map((_, colIndex) => {
                                        const isHighlighted =
                                            rowIndex < tableHoverSize.rows &&
                                            colIndex < tableHoverSize.cols;
                                        return (
                                            <div
                                                key={`${rowIndex}-${colIndex}`}
                                                style={{
                                                    width: '16px',
                                                    height: '16px',
                                                    border: '1px solid',
                                                    borderColor: isHighlighted ? '#2b579a' : '#d1d5db',
                                                    backgroundColor: isHighlighted ? '#e8f0fe' : '#fff',
                                                    borderRadius: '2px',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.1s ease',
                                                }}
                                                onMouseEnter={() => setTableHoverSize({
                                                    rows: rowIndex + 1,
                                                    cols: colIndex + 1,
                                                })}
                                                onClick={() => {
                                                    editor?.chain().focus().insertTable({
                                                        rows: rowIndex + 1,
                                                        cols: colIndex + 1,
                                                        withHeaderRow: true,
                                                    }).run();
                                                    setShowTablePicker(false);
                                                    setTableHoverSize({ rows: 0, cols: 0 });
                                                }}
                                            />
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div style={{ position: 'relative' }}>
                    <input
                        type="file"
                        accept="image/*"
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            opacity: 0,
                            cursor: 'pointer'
                        }}
                        onChange={onImageUpload}
                        title="Insert Image"
                    />
                    <ToolbarButton
                        isActive={false}
                        onClick={() => { }}
                        icon={ImageIcon}
                        label="Insert Image"
                    />
                </div>
            </div>

            {/* View & Review Group */}
            <div style={{ display: 'flex', gap: '1px', paddingRight: '8px', borderRight: '1px solid #e5e7eb', alignItems: 'center' }}>
                <ToolbarButton
                    isActive={showRuler}
                    onClick={onToggleRuler}
                    icon={Ruler}
                    label={showRuler ? "Hide Ruler" : "Show Ruler"}
                />
                <ToolbarButton
                    isActive={showPageLayoutDialog}
                    onClick={() => setShowPageLayoutDialog(true)}
                    icon={FileText}
                    label="ページ設定"
                />
                <ToolbarButton
                    isActive={showComments ?? true}
                    onClick={onToggleComments ?? (() => { })}
                    icon={MessageSquare}
                    label={showComments ? "コメントを隠す" : "コメントを表示"}
                />
            </div>

            {/* Actions Group (No Right Border) */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginLeft: 'auto' }}>
                <select
                    value={trackChangesDisplayMode}
                    onChange={(e) => onTrackChangesDisplayModeChange(e.target.value as TrackChangesDisplayMode)}
                    style={{
                        height: '28px',
                        padding: '0 8px',
                        borderRadius: '4px',
                        border: '1px solid #d1d5db',
                        fontSize: '12px',
                        cursor: 'pointer',
                        backgroundColor: '#fff',
                        minWidth: '100px',
                        color: '#374151',
                    }}
                    title="Track Changes Display Mode"
                >
                    <option value="markup">提案を表示</option>
                    <option value="final">提案を表示しない</option>
                </select>

                <button
                    onClick={handleOverwriteToggle}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '0 8px',
                        height: '28px',
                        borderRadius: '4px',
                        border: '1px solid',
                        borderColor: isOverwriteEnabled ? '#2b579a' : '#d1d5db',
                        backgroundColor: isOverwriteEnabled ? '#e8f0fe' : '#ffffff',
                        color: isOverwriteEnabled ? '#2b579a' : '#4b5563',
                        fontSize: '12px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        transition: 'all 0.1s',
                        whiteSpace: 'nowrap'
                    }}
                >
                    <div style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '2px',
                        border: '1px solid',
                        borderColor: isOverwriteEnabled ? '#2b579a' : '#d1d5db',
                        backgroundColor: isOverwriteEnabled ? '#2b579a' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}>
                        {isOverwriteEnabled && (
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                        )}
                    </div>
                    上書き保存
                </button>
            </div>

            {/* Page Layout Dialog Component */}
            {onPageLayoutChange && (
                <PageLayoutDialog
                    isOpen={showPageLayoutDialog}
                    onClose={() => setShowPageLayoutDialog(false)}
                    docAttrs={docAttrs}
                    onApply={onPageLayoutChange}
                />
            )}

            <OverwriteConfirmationDialog
                isOpen={showOverwriteConfirmDialog}
                onClose={() => setShowOverwriteConfirmDialog(false)}
                onConfirm={confirmOverwriteEnable}
            />
        </div>
    );
};
