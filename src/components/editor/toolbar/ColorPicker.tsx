'use client';

import React from 'react';

interface ColorPickerProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectColor: (color: string) => void;
    onClearColor: () => void;
    clearLabel: string;
}

// Preset colors matching SuperDoc/Word style
const PRESET_COLORS = [
    // Row 1 - Grayscale
    '#000000', '#444444', '#666666', '#999999', '#cccccc', '#eeeeee', '#f3f3f3', '#ffffff',
    // Row 2 - Dark colors
    '#5c0000', '#663300', '#4a4a00', '#003300', '#003366', '#000066', '#330066', '#660066',
    // Row 3 - Vivid colors
    '#cc0000', '#e69900', '#cccc00', '#00cc00', '#00cccc', '#0066cc', '#6600cc', '#cc00cc',
    // Row 4 - Bright colors
    '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#0099ff', '#9900ff', '#ff00ff',
    // Row 5 - Light colors
    '#ff9999', '#ffcc99', '#ffff99', '#99ff99', '#99ffff', '#99ccff', '#cc99ff', '#ff99ff',
    // Row 6 - Pastel colors
    '#ffcccc', '#ffe0cc', '#ffffcc', '#ccffcc', '#ccffff', '#cce0ff', '#e0ccff', '#ffccff',
];

/**
 * Color picker popup with preset colors grid
 */
export const ColorPicker: React.FC<ColorPickerProps> = ({
    isOpen,
    onClose,
    onSelectColor,
    onClearColor,
    clearLabel,
}) => {
    if (!isOpen) return null;

    return (
        <div
            style={{
                position: 'absolute',
                top: '100%',
                left: '0',
                marginTop: '4px',
                backgroundColor: '#fff',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                padding: '12px',
                zIndex: 1000,
                width: '220px',
            }}
            onClick={(e) => e.stopPropagation()}
        >
            {/* No Color Option */}
            <button
                onClick={() => {
                    onClearColor();
                    onClose();
                }}
                style={{
                    width: '100%',
                    padding: '6px 8px',
                    marginBottom: '8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    backgroundColor: '#fff',
                    cursor: 'pointer',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                }}
            >
                <div style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    border: '1px solid #d1d5db',
                    background: 'linear-gradient(135deg, #fff 45%, #ff0000 45%, #ff0000 55%, #fff 55%)',
                }} />
                {clearLabel}
            </button>
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(8, 1fr)',
                gap: '6px',
            }}>
                {PRESET_COLORS.map((color, index) => (
                    <button
                        key={index}
                        onClick={() => {
                            onSelectColor(color);
                            onClose();
                        }}
                        style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            backgroundColor: color,
                            border: color === '#ffffff' ? '1px solid #d1d5db' : 'none',
                            cursor: 'pointer',
                            transition: 'transform 0.1s',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.2)'}
                        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                        title={color}
                    />
                ))}
            </div>
        </div>
    );
};

export { PRESET_COLORS };
