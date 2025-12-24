'use client';

import React, { useState } from 'react';
import { Editor } from '@tiptap/react';
import {
    Bold, Italic, Underline, Undo2, Redo2,
    AlignLeft, AlignCenter, AlignRight, AlignJustify,
    List, ListOrdered, Grid3x3, Image as ImageIcon, Ruler
} from 'lucide-react';
import { ToolbarButton } from './ToolbarButton';
import { ColorPicker } from './ColorPicker';
import type { TrackChangesDisplayMode } from '../CustomDocEditor';

interface EditorToolbarProps {
    editor: Editor | null;
    showRuler: boolean;
    onToggleRuler: () => void;
    onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    trackChangesDisplayMode: TrackChangesDisplayMode;
    onTrackChangesDisplayModeChange: (mode: TrackChangesDisplayMode) => void;
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
}) => {
    const [showTextColorPicker, setShowTextColorPicker] = useState(false);
    const [showHighlightColorPicker, setShowHighlightColorPicker] = useState(false);
    const [showTablePicker, setShowTablePicker] = useState(false);
    const [tableHoverSize, setTableHoverSize] = useState({ rows: 0, cols: 0 });

    return (
        <div style={{
            padding: '6px 8px',
            backgroundColor: '#ffffff',
            display: 'flex',
            justifyContent: 'flex-start',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            zIndex: 10,
            flexShrink: 0,
            borderBottom: '1px solid #e1dfdd',
        }}>
            <div style={{
                display: 'flex',
                gap: '2px',
                alignItems: 'center',
                backgroundColor: '#ffffff',
                padding: '0 4px',
                borderRadius: '4px',
                width: '100%',
                flexWrap: 'wrap',
            }}>
                {/* Undo/Redo Group */}
                <div style={{ display: 'flex', gap: '2px', paddingRight: '8px', borderRight: '1px solid #e5e7eb' }}>
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

                {/* Font Styles Group */}
                <div style={{ display: 'flex', gap: '2px', padding: '0 8px', borderRight: '1px solid #e5e7eb' }}>
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
                </div>

                {/* Alignment Group */}
                <div style={{ display: 'flex', gap: '2px', padding: '0 8px', borderRight: '1px solid #e5e7eb' }}>
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
                </div>

                {/* Lists Group */}
                <div style={{ display: 'flex', gap: '2px', padding: '0 8px', borderRight: '1px solid #e5e7eb' }}>
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
                </div>

                {/* Font Family & Size Group */}
                <div style={{ display: 'flex', gap: '4px', padding: '0 8px', borderRight: '1px solid #e5e7eb', alignItems: 'center' }}>
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
                            padding: '4px 8px',
                            borderRadius: '4px',
                            border: '1px solid #d1d5db',
                            fontSize: '12px',
                            cursor: 'pointer',
                            backgroundColor: '#fff',
                            minWidth: '90px',
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
                        value={editor?.getAttributes('textStyle').fontSize?.replace('pt', '') || '11'}
                        onChange={(e) => editor?.chain().focus().setFontSize(`${e.target.value}pt`).run()}
                        style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            border: '1px solid #d1d5db',
                            fontSize: '12px',
                            cursor: 'pointer',
                            backgroundColor: '#fff',
                            minWidth: '50px',
                        }}
                        title="Font Size"
                    >
                        {['8', '9', '10', '10.5', '11', '12', '14', '16', '18', '20', '24', '28', '36', '48', '72'].map(size => (
                            <option key={size} value={size}>{size}</option>
                        ))}
                    </select>
                </div>

                {/* Text & Highlight Color Group */}
                <div style={{ display: 'flex', gap: '4px', padding: '0 8px', borderRight: '1px solid #e5e7eb', alignItems: 'center' }}>
                    {/* Text Color Button */}
                    <div style={{ position: 'relative' }}>
                        <button
                            onClick={() => {
                                setShowTextColorPicker(!showTextColorPicker);
                                setShowHighlightColorPicker(false);
                            }}
                            style={{
                                width: '28px',
                                height: '28px',
                                padding: '4px',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                backgroundColor: showTextColorPicker ? '#e5e7eb' : '#fff',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                            title="Text Color"
                        >
                            <span style={{ fontSize: '14px', fontWeight: 'bold', lineHeight: 1 }}>A</span>
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
                            }}
                            style={{
                                width: '28px',
                                height: '28px',
                                padding: '4px',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                backgroundColor: showHighlightColorPicker ? '#e5e7eb' : '#fff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                            title="Highlight Color"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m9 11-6 6v3h9l3-3" />
                                <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
                            </svg>
                            <div style={{
                                position: 'absolute',
                                bottom: '3px',
                                left: '4px',
                                right: '4px',
                                height: '3px',
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

                    <div style={{ width: '1px', height: '24px', backgroundColor: '#e5e7eb', margin: '0 8px' }} />

                    {/* Insert Group */}
                    <div style={{ display: 'flex', gap: '4px' }}>
                        {/* Table Insert with Grid Picker */}
                        <div style={{ position: 'relative' }}>
                            <ToolbarButton
                                isActive={showTablePicker}
                                onClick={() => {
                                    setShowTablePicker(!showTablePicker);
                                    setShowTextColorPicker(false);
                                    setShowHighlightColorPicker(false);
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

                    <div style={{ width: '1px', height: '24px', backgroundColor: '#e5e7eb', margin: '0 8px' }} />

                    {/* View Group */}
                    <ToolbarButton
                        isActive={showRuler}
                        onClick={onToggleRuler}
                        icon={Ruler}
                        label={showRuler ? "Hide Ruler" : "Show Ruler"}
                    />

                    <div style={{ width: '1px', height: '24px', backgroundColor: '#e5e7eb', margin: '0 8px' }} />

                    {/* Track Changes Display Mode */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <select
                            value={trackChangesDisplayMode}
                            onChange={(e) => onTrackChangesDisplayModeChange(e.target.value as TrackChangesDisplayMode)}
                            style={{
                                padding: '4px 8px',
                                borderRadius: '4px',
                                border: '1px solid #d1d5db',
                                fontSize: '12px',
                                cursor: 'pointer',
                                backgroundColor: '#fff',
                                minWidth: '120px',
                            }}
                            title="Track Changes Display Mode"
                        >
                            <option value="markup">提案を表示</option>
                            <option value="final">提案を表示しない</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    );
};
