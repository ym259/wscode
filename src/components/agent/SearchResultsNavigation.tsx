import React from 'react';
import { ChevronUp, ChevronDown, X } from 'lucide-react';

interface SearchMatch {
    blockIndex: number;
    text: string;
    relevance: number;
    reason: string;
}

interface SearchResultsNavigationProps {
    results: SearchMatch[];
    currentIndex: number;
    onNext: () => void;
    onPrev: () => void;
    onClose: () => void;
    onSelect: (index: number) => void;
}

export const SearchResultsNavigation: React.FC<SearchResultsNavigationProps> = ({
    results,
    currentIndex,
    onNext,
    onPrev,
    onClose,
    onSelect
}) => {
    if (results.length === 0) return null;

    const currentMatch = results[currentIndex];

    return (
        <div style={{
            padding: '8px 12px',
            backgroundColor: '#f0f4ff', // Light blue background
            borderBottom: '1px solid #d1d9e6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '13px',
            color: '#1f2937',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                <span style={{ fontWeight: 600, color: '#2b579a', whiteSpace: 'nowrap' }}>
                    Match {currentIndex + 1} of {results.length}
                </span>
                <span style={{
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: '180px',
                    color: '#4b5563'
                }} title={currentMatch.reason || currentMatch.text}>
                    {currentMatch.reason || currentMatch.text}
                </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                    onClick={onPrev}
                    style={{
                        padding: '4px',
                        borderRadius: '4px',
                        border: '1px solid #d1d5db',
                        backgroundColor: '#fff',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center'
                    }}
                    title="Previous match"
                >
                    <ChevronUp size={14} />
                </button>
                <button
                    onClick={onNext}
                    style={{
                        padding: '4px',
                        borderRadius: '4px',
                        border: '1px solid #d1d5db',
                        backgroundColor: '#fff',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center'
                    }}
                    title="Next match"
                >
                    <ChevronDown size={14} />
                </button>
                <div style={{ width: '1px', height: '16px', backgroundColor: '#d1d5db', margin: '0 4px' }} />
                <button
                    onClick={onClose}
                    style={{
                        padding: '4px',
                        borderRadius: '4px',
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        color: '#6b7280',
                        display: 'flex',
                        alignItems: 'center'
                    }}
                    title="Dismiss"
                >
                    <X size={14} />
                </button>
            </div>
        </div>
    );
};
