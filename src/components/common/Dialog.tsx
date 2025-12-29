import React, { useEffect, useRef } from 'react';

interface DialogProps {
    isOpen: boolean;
    title: string;
    message?: string;
    description?: string;
    inputValue?: string;
    placeholder?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: (value?: string) => void;
    onCancel: () => void;
    onChange?: (value: string) => void;
    isInput?: boolean;
}

export function Dialog({
    isOpen,
    title,
    message,
    description,
    inputValue = '',
    placeholder = '',
    confirmLabel = 'OK',
    cancelLabel = 'Cancel',
    onConfirm,
    onCancel,
    onChange,
    isInput = false,
}: DialogProps) {
    const inputRef = useRef<HTMLInputElement>(null);

    // Focus input on open
    useEffect(() => {
        if (isOpen && isInput) {
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen, isInput]);

    // Handle Enter/Escape
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                onConfirm(isInput ? inputValue : undefined);
            } else if (e.key === 'Escape') {
                onCancel();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, inputValue, onConfirm, onCancel, isInput]);

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            paddingTop: '60px', // Position slightly below top like VS Code
            zIndex: 9999,
        }}>
            <div style={{
                backgroundColor: '#252526', // VS Code menu background
                color: '#cccccc',
                border: '1px solid #454545',
                borderRadius: '5px',
                width: '400px',
                padding: '0',
                boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
                display: 'flex',
                flexDirection: 'column',
            }}>
                {/* Header */}
                <div style={{
                    padding: '10px 15px',
                    borderBottom: '1px solid #454545',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#e7e7e7',
                }}>
                    {title}
                </div>

                {/* Body */}
                <div style={{ padding: '15px' }}>
                    {message && <div style={{ marginBottom: '10px', fontSize: '13px' }}>{message}</div>}
                    {description && <div style={{ marginBottom: '15px', fontSize: '12px', color: '#999' }}>{description}</div>}

                    {isInput && (
                        <input
                            ref={inputRef}
                            type="text"
                            value={inputValue}
                            onChange={(e) => onChange?.(e.target.value)}
                            placeholder={placeholder}
                            style={{
                                width: '100%',
                                padding: '6px 8px',
                                backgroundColor: '#3c3c3c', // VS Code input background
                                border: '1px solid #3c3c3c',
                                color: '#cccccc',
                                borderRadius: '2px',
                                outline: 'none',
                                fontSize: '13px',
                                boxSizing: 'border-box',
                            }}
                            onFocus={(e) => e.target.style.borderColor = '#007fd4'} // Focus color
                            onBlur={(e) => e.target.style.borderColor = '#3c3c3c'}
                        />
                    )}
                </div>

                {/* Footer Buttons */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '8px',
                    padding: '10px 15px',
                    // borderTop: '1px solid #2d2d2d',
                }}>
                    <button
                        onClick={onCancel}
                        style={{
                            padding: '6px 12px',
                            backgroundColor: 'transparent',
                            border: '1px solid transparent',
                            color: '#cccccc',
                            cursor: 'pointer',
                            fontSize: '12px',
                            borderRadius: '2px',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                        {cancelLabel}
                    </button>
                    <button
                        onClick={() => onConfirm(isInput ? inputValue : undefined)}
                        style={{
                            padding: '6px 12px',
                            backgroundColor: '#007fd4', // VS Code blue
                            border: '1px solid #007fd4',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: '12px',
                            borderRadius: '2px',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#026ec1'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#007fd4'}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
