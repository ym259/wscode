import React from 'react';

interface RulerProps {
    showRuler: boolean;
}

export const Ruler: React.FC<RulerProps> = ({ showRuler }) => {
    if (!showRuler) return null;

    return (
        <div style={{
            width: '100%',
            height: '24px',
            backgroundColor: '#fff',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            alignItems: 'flex-end',
            padding: '0 24px',
            fontSize: '10px',
            color: '#9ca3af',
            flexShrink: 0,
        }}>
            <div style={{
                flex: 1,
                height: '100%',
                display: 'flex',
                alignItems: 'flex-end',
                backgroundImage: 'linear-gradient(90deg, transparent 9px, #e5e7eb 9px, #e5e7eb 10px, transparent 10px)',
                backgroundSize: '10px 100%'
            }}>
                {Array.from({ length: 20 }).map((_, i) => (
                    <div key={i} style={{ width: '50px', borderLeft: '1px solid #9ca3af', height: '12px', paddingLeft: '2px' }}>
                        {i + 1}
                    </div>
                ))}
            </div>
        </div>
    );
};
