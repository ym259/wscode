import { useState, useRef, useCallback } from 'react';

interface UseAutoScrollReturn {
    messagesEndRef: React.RefObject<HTMLDivElement | null>;
    messagesContainerRef: React.RefObject<HTMLDivElement | null>;
    isUserScrolledUp: boolean;
    handleScroll: () => void;
    scrollToBottom: (force?: boolean) => void;
    forceScrollToBottom: () => void;
}

/**
 * Smart auto-scroll hook that tracks user scroll position
 * and respects manual scrolling while allowing programmatic scroll
 */
export function useAutoScroll(): UseAutoScrollReturn {
    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const messagesContainerRef = useRef<HTMLDivElement | null>(null);
    const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);

    // Check if user is near the bottom of the messages container
    const isNearBottom = useCallback(() => {
        const container = messagesContainerRef.current;
        if (!container) return true;

        // Consider "at bottom" if within 150px of the end
        const threshold = 150;
        const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        return distanceFromBottom <= threshold;
    }, []);

    // Handle scroll events to track user's scroll position
    const handleScroll = useCallback(() => {
        setIsUserScrolledUp(!isNearBottom());
    }, [isNearBottom]);

    // Scroll to bottom - respects user intent unless forced
    const scrollToBottom = useCallback((force = false) => {
        if (!force && isUserScrolledUp) return;
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [isUserScrolledUp]);

    // Force scroll to bottom and reset user scroll state
    const forceScrollToBottom = useCallback(() => {
        setIsUserScrolledUp(false);
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    return {
        messagesEndRef,
        messagesContainerRef,
        isUserScrolledUp,
        handleScroll,
        scrollToBottom,
        forceScrollToBottom,
    };
}
