import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface OverwriteConfirmationDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
}

export const OverwriteConfirmationDialog: React.FC<OverwriteConfirmationDialogProps> = ({
    isOpen,
    onClose,
    onConfirm
}) => {
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
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
        }}>
            <div style={{
                backgroundColor: '#fff',
                borderRadius: '8px',
                width: '450px',
                maxWidth: '90vw',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
            }}>
                {/* Header */}
                <div style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid #e5e7eb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#111827' }}>
                        上書き保存の有効化
                    </h3>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#6b7280',
                            padding: '4px',
                            display: 'flex',
                            alignItems: 'center',
                        }}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div style={{ padding: '20px' }}>
                    <div style={{
                        backgroundColor: '#fff7ed',
                        border: '1px solid #fed7aa',
                        borderRadius: '6px',
                        padding: '12px',
                        marginBottom: '16px',
                        display: 'flex',
                        gap: '12px',
                        alignItems: 'start',
                    }}>
                        <AlertTriangle size={20} color="#c2410c" style={{ flexShrink: 0, marginTop: '2px' }} />
                        <p style={{ margin: 0, fontSize: '14px', color: '#9a3412', lineHeight: '1.5' }}>
                            保存（Cmd+S）時にローカルファイルが直接上書きされます。
                        </p>
                    </div>

                    <p style={{ margin: 0, fontSize: '14px', color: '#374151', lineHeight: '1.6' }}>
                        DOCX特有のレイアウトやスタイルの再現に最善を尽くし開発していますが、微細な差異が生じる可能性があります。まずは上書きなしでの保存（ダウンロード）を利用して、慣れてから<strong>上書き保存</strong>に切り替えることを推奨します。
                    </p>
                </div>

                {/* Footer */}
                <div style={{
                    padding: '16px 20px',
                    backgroundColor: '#f9fafb',
                    borderTop: '1px solid #e5e7eb',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '12px',
                }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '6px',
                            border: '1px solid #d1d5db',
                            backgroundColor: '#fff',
                            color: '#374151',
                            fontSize: '14px',
                            fontWeight: 500,
                            cursor: 'pointer',
                        }}
                    >
                        キャンセル
                    </button>
                    <button
                        onClick={onConfirm}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '6px',
                            border: 'none',
                            backgroundColor: '#2563eb',
                            color: '#fff',
                            fontSize: '14px',
                            fontWeight: 500,
                            cursor: 'pointer',
                        }}
                    >
                        有効にする
                    </button>
                </div>
            </div>
        </div>
    );
};
