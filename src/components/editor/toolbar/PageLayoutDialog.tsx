'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, FileText, Maximize2 } from 'lucide-react';

interface PageLayoutDialogProps {
    isOpen: boolean;
    onClose: () => void;
    docAttrs: any;
    onApply: (updates: {
        pageSize?: { width: number; height: number };
        pageMargins?: { top: number; right: number; bottom: number; left: number };
    }) => void;
}

// Page size presets in twips (1mm ≈ 56.69 twips)
const PAGE_SIZE_PRESETS = [
    { id: 'A4', label: 'A4', description: '210 × 297 mm', width: 11906, height: 16838 },
    { id: 'A4_LANDSCAPE', label: 'A4 横', description: '297 × 210 mm', width: 16838, height: 11906 },
    { id: 'B5', label: 'B5', description: '182 × 257 mm', width: 10319, height: 14571 },
    { id: 'LETTER', label: 'Letter', description: '8.5 × 11 in', width: 12240, height: 15840 },
    { id: 'LEGAL', label: 'Legal', description: '8.5 × 14 in', width: 12240, height: 20160 },
];

// Margin presets in twips
const MARGIN_PRESETS = [
    { id: 'JP_COURT_25MM', label: '裁判所標準', description: '上下左右 25mm', top: 1417, right: 1417, bottom: 1417, left: 1417 },
    { id: 'JP_COURT_30_20', label: '裁判所（上広め）', description: '上 30mm / 他 20mm', top: 1701, right: 1134, bottom: 1134, left: 1134 },
    { id: 'WORD_DEFAULT', label: 'Word 標準', description: '上下 25.4mm / 左右 31.75mm', top: 1440, right: 1800, bottom: 1440, left: 1800 },
    { id: 'NARROW', label: '狭い', description: '上下左右 12.7mm', top: 720, right: 720, bottom: 720, left: 720 },
    { id: 'WIDE', label: '広い', description: '上下 25.4mm / 左右 50.8mm', top: 1440, right: 2880, bottom: 1440, left: 2880 },
];

// Convert twips to mm
const twipsToMm = (twips: number): number => Math.round((twips / 56.69) * 10) / 10;
// Convert mm to twips
const mmToTwips = (mm: number): number => Math.round(mm * 56.69);

export const PageLayoutDialog: React.FC<PageLayoutDialogProps> = ({
    isOpen,
    onClose,
    docAttrs,
    onApply,
}) => {
    // State for page size
    const [selectedPageSize, setSelectedPageSize] = useState<string>('A4');
    const [customWidth, setCustomWidth] = useState<number>(210);
    const [customHeight, setCustomHeight] = useState<number>(297);
    const [useCustomSize, setUseCustomSize] = useState(false);

    // State for margins
    const [selectedMarginPreset, setSelectedMarginPreset] = useState<string>('WORD_DEFAULT');
    const [marginTop, setMarginTop] = useState<number>(25.4);
    const [marginRight, setMarginRight] = useState<number>(31.75);
    const [marginBottom, setMarginBottom] = useState<number>(25.4);
    const [marginLeft, setMarginLeft] = useState<number>(31.75);
    const [useCustomMargins, setUseCustomMargins] = useState(false);

    // Initialize from docAttrs when dialog opens
    useEffect(() => {
        if (isOpen && docAttrs) {
            const widthTwips = docAttrs?.pageSize?.['w:w'] || 11906;
            const heightTwips = docAttrs?.pageSize?.['w:h'] || 16838;

            // Try to match a preset
            const matchedPreset = PAGE_SIZE_PRESETS.find(
                p => Math.abs(p.width - widthTwips) < 100 && Math.abs(p.height - heightTwips) < 100
            );

            if (matchedPreset) {
                // eslint-disable-next-line react-hooks/set-state-in-effect
                setSelectedPageSize(prev => prev !== matchedPreset.id ? matchedPreset.id : prev);
                setUseCustomSize(prev => prev !== false ? false : prev);
            } else {
                setUseCustomSize(prev => prev !== true ? true : prev);
            }

            setCustomWidth(prev => { const val = twipsToMm(widthTwips); return prev !== val ? val : prev; });
            setCustomHeight(prev => { const val = twipsToMm(heightTwips); return prev !== val ? val : prev; });

            // Margins
            const topTwips = docAttrs?.pageMargins?.['w:top'] || 1440;
            const rightTwips = docAttrs?.pageMargins?.['w:right'] || 1800;
            const bottomTwips = docAttrs?.pageMargins?.['w:bottom'] || 1440;
            const leftTwips = docAttrs?.pageMargins?.['w:left'] || 1800;

            const matchedMargin = MARGIN_PRESETS.find(
                p => Math.abs(p.top - topTwips) < 50 &&
                    Math.abs(p.right - rightTwips) < 50 &&
                    Math.abs(p.bottom - bottomTwips) < 50 &&
                    Math.abs(p.left - leftTwips) < 50
            );

            if (matchedMargin) {
                setSelectedMarginPreset(prev => prev !== matchedMargin.id ? matchedMargin.id : prev);
                setUseCustomMargins(prev => prev !== false ? false : prev);
            } else {
                setUseCustomMargins(prev => prev !== true ? true : prev);
            }

            setMarginTop(prev => { const val = twipsToMm(topTwips); return prev !== val ? val : prev; });
            setMarginRight(prev => { const val = twipsToMm(rightTwips); return prev !== val ? val : prev; });
            setMarginBottom(prev => { const val = twipsToMm(bottomTwips); return prev !== val ? val : prev; });
            setMarginLeft(prev => { const val = twipsToMm(leftTwips); return prev !== val ? val : prev; });
        }
    }, [isOpen, docAttrs]);

    const handleApply = () => {
        const updates: {
            pageSize?: { width: number; height: number };
            pageMargins?: { top: number; right: number; bottom: number; left: number };
        } = {};

        // Page size
        if (useCustomSize) {
            updates.pageSize = {
                width: mmToTwips(customWidth),
                height: mmToTwips(customHeight),
            };
        } else {
            const preset = PAGE_SIZE_PRESETS.find(p => p.id === selectedPageSize);
            if (preset) {
                updates.pageSize = { width: preset.width, height: preset.height };
            }
        }

        // Margins
        if (useCustomMargins) {
            updates.pageMargins = {
                top: mmToTwips(marginTop),
                right: mmToTwips(marginRight),
                bottom: mmToTwips(marginBottom),
                left: mmToTwips(marginLeft),
            };
        } else {
            const preset = MARGIN_PRESETS.find(p => p.id === selectedMarginPreset);
            if (preset) {
                updates.pageMargins = {
                    top: preset.top,
                    right: preset.right,
                    bottom: preset.bottom,
                    left: preset.left,
                };
            }
        }

        onApply(updates);
        onClose();
    };

    const handlePagePresetClick = (presetId: string) => {
        setSelectedPageSize(presetId);
        setUseCustomSize(false);
        const preset = PAGE_SIZE_PRESETS.find(p => p.id === presetId);
        if (preset) {
            setCustomWidth(twipsToMm(preset.width));
            setCustomHeight(twipsToMm(preset.height));
        }
    };

    const handleMarginPresetClick = (presetId: string) => {
        setSelectedMarginPreset(presetId);
        setUseCustomMargins(false);
        const preset = MARGIN_PRESETS.find(p => p.id === presetId);
        if (preset) {
            setMarginTop(twipsToMm(preset.top));
            setMarginRight(twipsToMm(preset.right));
            setMarginBottom(twipsToMm(preset.bottom));
            setMarginLeft(twipsToMm(preset.left));
        }
    };

    if (!isOpen) return null;

    // Use portal to render outside the component tree, avoiding stacking context issues
    return createPortal(
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10000,
            }}
            onClick={onClose}
        >
            <div
                style={{
                    backgroundColor: '#fff',
                    borderRadius: '12px',
                    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)',
                    width: '520px',
                    maxHeight: '90vh',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div
                    style={{
                        padding: '16px 20px',
                        borderBottom: '1px solid #e5e7eb',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: 'linear-gradient(to right, #667eea, #764ba2)',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <FileText size={20} color="#fff" />
                        <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#fff' }}>
                            ページ設定
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255,255,255,0.2)',
                            border: 'none',
                            width: '28px',
                            height: '28px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'background 0.2s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                    >
                        <X size={16} color="#fff" />
                    </button>
                </div>

                {/* Content */}
                <div style={{ padding: '20px', overflow: 'auto', flex: 1 }}>
                    {/* Page Size Section */}
                    <div style={{ marginBottom: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                            <Maximize2 size={16} color="#6b7280" />
                            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#374151' }}>
                                用紙サイズ
                            </h3>
                        </div>

                        {/* Preset Buttons */}
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                            {PAGE_SIZE_PRESETS.map(preset => (
                                <button
                                    key={preset.id}
                                    onClick={() => handlePagePresetClick(preset.id)}
                                    style={{
                                        padding: '8px 14px',
                                        borderRadius: '8px',
                                        border: '2px solid',
                                        borderColor: !useCustomSize && selectedPageSize === preset.id ? '#667eea' : '#e5e7eb',
                                        backgroundColor: !useCustomSize && selectedPageSize === preset.id ? '#f0f0ff' : '#fff',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'flex-start',
                                    }}
                                >
                                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>
                                        {preset.label}
                                    </span>
                                    <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                                        {preset.description}
                                    </span>
                                </button>
                            ))}
                        </div>

                        {/* Custom Size */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            padding: '12px',
                            backgroundColor: useCustomSize ? '#f9fafb' : '#fff',
                            borderRadius: '8px',
                            border: '1px solid #e5e7eb',
                        }}>
                            <input
                                type="checkbox"
                                checked={useCustomSize}
                                onChange={e => setUseCustomSize(e.target.checked)}
                                style={{ width: '16px', height: '16px', accentColor: '#667eea' }}
                            />
                            <span style={{ fontSize: '13px', color: '#374151', minWidth: '80px' }}>カスタム:</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input
                                    type="number"
                                    value={customWidth}
                                    onChange={e => { setCustomWidth(parseFloat(e.target.value) || 0); setUseCustomSize(true); }}
                                    style={{
                                        width: '70px',
                                        padding: '6px 8px',
                                        border: '1px solid #d1d5db',
                                        borderRadius: '6px',
                                        fontSize: '13px',
                                        backgroundColor: '#fff',
                                    }}
                                />
                                <span style={{ color: '#6b7280', fontSize: '13px' }}>×</span>
                                <input
                                    type="number"
                                    value={customHeight}
                                    onChange={e => { setCustomHeight(parseFloat(e.target.value) || 0); setUseCustomSize(true); }}
                                    style={{
                                        width: '70px',
                                        padding: '6px 8px',
                                        border: '1px solid #d1d5db',
                                        borderRadius: '6px',
                                        fontSize: '13px',
                                        backgroundColor: '#fff',
                                    }}
                                />
                                <span style={{ color: '#9ca3af', fontSize: '12px' }}>mm</span>
                            </div>
                        </div>
                    </div>

                    {/* Margins Section */}
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
                                <rect x="3" y="3" width="18" height="18" rx="2" />
                                <rect x="7" y="7" width="10" height="10" rx="1" fill="#e5e7eb" />
                            </svg>
                            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#374151' }}>
                                余白
                            </h3>
                        </div>

                        {/* Margin Preset Buttons */}
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                            {MARGIN_PRESETS.map(preset => (
                                <button
                                    key={preset.id}
                                    onClick={() => handleMarginPresetClick(preset.id)}
                                    style={{
                                        padding: '8px 14px',
                                        borderRadius: '8px',
                                        border: '2px solid',
                                        borderColor: !useCustomMargins && selectedMarginPreset === preset.id ? '#667eea' : '#e5e7eb',
                                        backgroundColor: !useCustomMargins && selectedMarginPreset === preset.id ? '#f0f0ff' : '#fff',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'flex-start',
                                    }}
                                >
                                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>
                                        {preset.label}
                                    </span>
                                    <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                                        {preset.description}
                                    </span>
                                </button>
                            ))}
                        </div>

                        {/* Custom Margins */}
                        <div style={{
                            padding: '16px',
                            backgroundColor: useCustomMargins ? '#f9fafb' : '#fff',
                            borderRadius: '8px',
                            border: '1px solid #e5e7eb',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                <input
                                    type="checkbox"
                                    checked={useCustomMargins}
                                    onChange={e => setUseCustomMargins(e.target.checked)}
                                    style={{ width: '16px', height: '16px', accentColor: '#667eea' }}
                                />
                                <span style={{ fontSize: '13px', color: '#374151' }}>カスタム余白 (mm)</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ fontSize: '12px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>上</label>
                                    <input
                                        type="number"
                                        value={marginTop}
                                        onChange={e => { setMarginTop(parseFloat(e.target.value) || 0); setUseCustomMargins(true); }}
                                        style={{
                                            width: '100%',
                                            padding: '8px 10px',
                                            border: '1px solid #d1d5db',
                                            borderRadius: '6px',
                                            fontSize: '13px',
                                            backgroundColor: '#fff',
                                        }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>下</label>
                                    <input
                                        type="number"
                                        value={marginBottom}
                                        onChange={e => { setMarginBottom(parseFloat(e.target.value) || 0); setUseCustomMargins(true); }}
                                        style={{
                                            width: '100%',
                                            padding: '8px 10px',
                                            border: '1px solid #d1d5db',
                                            borderRadius: '6px',
                                            fontSize: '13px',
                                            backgroundColor: '#fff',
                                        }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>左</label>
                                    <input
                                        type="number"
                                        value={marginLeft}
                                        onChange={e => { setMarginLeft(parseFloat(e.target.value) || 0); setUseCustomMargins(true); }}
                                        style={{
                                            width: '100%',
                                            padding: '8px 10px',
                                            border: '1px solid #d1d5db',
                                            borderRadius: '6px',
                                            fontSize: '13px',
                                            backgroundColor: '#fff',
                                        }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>右</label>
                                    <input
                                        type="number"
                                        value={marginRight}
                                        onChange={e => { setMarginRight(parseFloat(e.target.value) || 0); setUseCustomMargins(true); }}
                                        style={{
                                            width: '100%',
                                            padding: '8px 10px',
                                            border: '1px solid #d1d5db',
                                            borderRadius: '6px',
                                            fontSize: '13px',
                                            backgroundColor: '#fff',
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div
                    style={{
                        padding: '16px 20px',
                        borderTop: '1px solid #e5e7eb',
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: '10px',
                        backgroundColor: '#f9fafb',
                    }}
                >
                    <button
                        onClick={onClose}
                        style={{
                            padding: '10px 20px',
                            borderRadius: '8px',
                            border: '1px solid #d1d5db',
                            backgroundColor: '#fff',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 500,
                            color: '#374151',
                            transition: 'all 0.2s',
                        }}
                    >
                        キャンセル
                    </button>
                    <button
                        onClick={handleApply}
                        style={{
                            padding: '10px 24px',
                            borderRadius: '8px',
                            border: 'none',
                            background: 'linear-gradient(to right, #667eea, #764ba2)',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 600,
                            color: '#fff',
                            boxShadow: '0 2px 8px rgba(102, 126, 234, 0.4)',
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                    >
                        適用
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
