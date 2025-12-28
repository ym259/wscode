'use client';

import React from 'react';
import { LucideIcon } from 'lucide-react';

interface ToolbarButtonProps {
    isActive: boolean;
    onClick: () => void;
    icon: LucideIcon;
    label: string;
}

/**
 * Reusable toolbar button with hover states
 */
export const ToolbarButton: React.FC<ToolbarButtonProps> = ({
    isActive,
    onClick,
    icon: Icon,
    label
}) => (
    <button
        onClick={onClick}
        title={label}
        style={{
            padding: '8px',
            borderRadius: '4px',
            transition: 'background-color 0.15s ease',
            backgroundColor: isActive ? '#e5e7eb' : 'transparent',
            color: isActive ? '#2563eb' : '#4b5563',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
        }}
        onMouseEnter={(e) => {
            if (!isActive) e.currentTarget.style.backgroundColor = '#f3f4f6';
        }}
        onMouseLeave={(e) => {
            if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
        }}
    >
        <Icon size={18} />
    </button>
);
