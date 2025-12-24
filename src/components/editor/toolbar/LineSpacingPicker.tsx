'use client';

import React from 'react';
import { Editor } from '@tiptap/react';
import { Check } from 'lucide-react';

interface LineSpacingPickerProps {
    isOpen: boolean;
    onClose: () => void;
    editor: Editor | null;
}

// Line spacing options (multiplier * 240 = twips value for Word compatibility)
const LINE_SPACING_OPTIONS = [
    { label: '1.0', value: 240 },
    { label: '1.15', value: 276 },
    { label: '1.5', value: 360 },
    { label: '2.0', value: 480 },
    { label: '2.5', value: 600 },
    { label: '3.0', value: 720 },
];

// Spacing presets (in twips: 1pt = 20 twips)
const PARAGRAPH_SPACING = {
    SMALL: 120,   // 6pt
    MEDIUM: 200,  // 10pt
    LARGE: 280,   // 14pt
};

export const LineSpacingPicker: React.FC<LineSpacingPickerProps> = ({
    isOpen,
    onClose,
    editor,
}) => {
    if (!isOpen || !editor) return null;

    // Get current line height from selected paragraph
    const getCurrentLineHeight = (): number | null => {
        const { lineHeight } = editor.getAttributes('paragraph');
        return lineHeight ? parseInt(lineHeight) : null;
    };

    const currentLineHeight = getCurrentLineHeight();

    const handleSelectLineSpacing = (value: number) => {
        editor.chain().focus().updateAttributes('paragraph', { lineHeight: value }).run();
        onClose();
    };

    const handleAddSpaceBefore = () => {
        const currentSpacing = parseInt(editor.getAttributes('paragraph').spacingBefore) || 0;
        editor.chain().focus().updateAttributes('paragraph', {
            spacingBefore: currentSpacing + PARAGRAPH_SPACING.MEDIUM
        }).run();
        onClose();
    };

    const handleAddSpaceAfter = () => {
        const currentSpacing = parseInt(editor.getAttributes('paragraph').spacingAfter) || 0;
        editor.chain().focus().updateAttributes('paragraph', {
            spacingAfter: currentSpacing + PARAGRAPH_SPACING.MEDIUM
        }).run();
        onClose();
    };

    const handleRemoveSpaceBefore = () => {
        editor.chain().focus().updateAttributes('paragraph', { spacingBefore: 0 }).run();
        onClose();
    };

    const handleRemoveSpaceAfter = () => {
        editor.chain().focus().updateAttributes('paragraph', { spacingAfter: 0 }).run();
        onClose();
    };

    return (
        <>
            {/* Backdrop */}
            <div
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 99,
                }}
                onClick={onClose}
            />
            {/* Menu */}
            <div
                style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    marginTop: '4px',
                    backgroundColor: '#1f1f1f',
                    border: '1px solid #3a3a3a',
                    borderRadius: '6px',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                    minWidth: '180px',
                    zIndex: 100,
                    overflow: 'hidden',
                }}
            >
                {/* Line spacing options */}
                <div style={{ padding: '4px 0' }}>
                    {LINE_SPACING_OPTIONS.map(option => {
                        const isSelected = currentLineHeight !== null &&
                            Math.abs(currentLineHeight - option.value) < 20;
                        return (
                            <button
                                key={option.label}
                                onClick={() => handleSelectLineSpacing(option.value)}
                                style={{
                                    width: '100%',
                                    padding: '8px 16px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    backgroundColor: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: '#ffffff',
                                    fontSize: '13px',
                                    textAlign: 'left',
                                    transition: 'background-color 0.1s',
                                }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#333333'}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                <span style={{ width: '16px' }}>
                                    {isSelected && <Check size={14} color="#ffffff" />}
                                </span>
                                <span>{option.label}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Divider */}
                <div style={{ height: '1px', backgroundColor: '#3a3a3a', margin: '4px 0' }} />

                {/* Paragraph spacing options */}
                <div style={{ padding: '4px 0' }}>
                    <button
                        onClick={handleAddSpaceBefore}
                        style={{
                            width: '100%',
                            padding: '8px 16px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            backgroundColor: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#ffffff',
                            fontSize: '13px',
                            textAlign: 'left',
                            transition: 'background-color 0.1s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#333333'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                        <span style={{ width: '16px' }}></span>
                        <span>段落前に間隔を追加</span>
                    </button>
                    <button
                        onClick={handleAddSpaceAfter}
                        style={{
                            width: '100%',
                            padding: '8px 16px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            backgroundColor: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#ffffff',
                            fontSize: '13px',
                            textAlign: 'left',
                            transition: 'background-color 0.1s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#333333'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                        <span style={{ width: '16px' }}></span>
                        <span>段落後に間隔を追加</span>
                    </button>
                </div>

                {/* Divider */}
                <div style={{ height: '1px', backgroundColor: '#3a3a3a', margin: '4px 0' }} />

                {/* Remove spacing options */}
                <div style={{ padding: '4px 0' }}>
                    <button
                        onClick={handleRemoveSpaceBefore}
                        style={{
                            width: '100%',
                            padding: '8px 16px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            backgroundColor: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#9ca3af',
                            fontSize: '12px',
                            textAlign: 'left',
                            transition: 'background-color 0.1s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#333333'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                        <span style={{ width: '16px' }}></span>
                        <span>段落前の間隔を削除</span>
                    </button>
                    <button
                        onClick={handleRemoveSpaceAfter}
                        style={{
                            width: '100%',
                            padding: '8px 16px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            backgroundColor: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#9ca3af',
                            fontSize: '12px',
                            textAlign: 'left',
                            transition: 'background-color 0.1s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#333333'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                        <span style={{ width: '16px' }}></span>
                        <span>段落後の間隔を削除</span>
                    </button>
                </div>
            </div>
        </>
    );
};
