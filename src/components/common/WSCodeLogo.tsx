import React from 'react';

interface WSCodeLogoProps {
    size?: number;
    className?: string;
    animate?: boolean;
}

export const WSCodeLogo: React.FC<WSCodeLogoProps> = ({
    size = 32,
    className = '',
    animate = true
}) => {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 48 48"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
        >
            {/* Document Shape */}
            <rect
                x="8"
                y="4"
                width="32"
                height="40"
                rx="4"
                stroke="currentColor"
                strokeWidth="2.5"
                fill="none"
            />

            {/* Document Lines */}
            <path
                d="M16 14H32"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                opacity="0.4"
            />
            <path
                d="M16 22H32"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                opacity="0.4"
            />

            {/* Code / Active Line */}
            <path
                d="M16 30H24"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                opacity="0.8"
            />

            {/* Cursor */}
            <rect
                x="28"
                y="26"
                width="3"
                height="8"
                fill="currentColor"
                className={animate ? "cursor-blink" : ""}
            >
                {animate && (
                    <animate
                        attributeName="opacity"
                        values="1;0;1"
                        dur="1s"
                        repeatCount="indefinite"
                    />
                )}
            </rect>
        </svg>
    );
};
