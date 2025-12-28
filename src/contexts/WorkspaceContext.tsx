'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { FileSystemItem, EditorTab, ChatMessage, WorkspaceState, AttachedSelection } from '@/types';
import { AgentEvent } from '@/types';
import { saveToDB, getFromDB, STORAGE_KEYS } from '@/lib/indexeddb';

// Type for the AI action handler function
export type AIActionHandler = (
    prompt: string,
    history: ChatMessage[],
    onUpdate: (event: AgentEvent) => void,
    images?: string[]
) => Promise<void>;

// Type for voice tool handler (executes individual tools by name)
export type VoiceToolHandler = (
    toolName: string,
    args: Record<string, unknown>
) => Promise<string>;

interface WorkspaceContextType extends WorkspaceState {
    setRootItems: (items: FileSystemItem[]) => void;
    addWorkspaceItem: (item: FileSystemItem) => void;
    removeWorkspaceItem: (path: string) => void;
    openFile: (item: FileSystemItem, file: File) => void;
    closeTab: (tabId: string) => void;
    setActiveTab: (tabId: string) => void;
    addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => string;
    updateMessage: (id: string, updates: Partial<ChatMessage>) => void;
    togglePanel: () => void;
    // AI Action integration
    aiActionHandler: AIActionHandler | null;
    setAIActionHandler: (handler: AIActionHandler | null) => void;
    // Voice tool handler (for realtime voice agent)
    voiceToolHandler: VoiceToolHandler | null;
    setVoiceToolHandler: (handler: VoiceToolHandler | null) => void;
    // Selection attach (Cmd+I)
    attachedSelection: AttachedSelection | null;
    setAttachedSelection: (selection: AttachedSelection | null) => void;
    clearAttachedSelection: () => void;
    // Outline Support
    activeOutline: OutlineItem[];
    setActiveOutline: (outline: OutlineItem[]) => void;
    navRequest: string | null;
    setNavRequest: (id: string | null) => void;
}

export interface OutlineItem {
    id: string; // The block ID or header ID
    text: string;
    level: number; // 1-6
}

const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
    const [rootItems, setRootItemsState] = useState<FileSystemItem[]>([]);
    const [openTabs, setOpenTabs] = useState<EditorTab[]>([]);
    const [activeTabId, setActiveTabId] = useState<string | null>(null);
    const [agentMessages, setAgentMessages] = useState<ChatMessage[]>([]);
    const [isPanelOpen, setIsPanelOpen] = useState(true);
    const [aiActionHandler, setAIActionHandler] = useState<AIActionHandler | null>(null);
    const [voiceToolHandler, setVoiceToolHandler] = useState<VoiceToolHandler | null>(null);
    const [attachedSelection, setAttachedSelectionState] = useState<AttachedSelection | null>(null);
    const [activeOutline, setActiveOutline] = useState<OutlineItem[]>([]);
    const [navRequest, setNavRequest] = useState<string | null>(null);

    // Load workspace state from IDB on mount
    useEffect(() => {
        const restoreWorkspace = async () => {
            // Restore Root Items
            const handles = await getFromDB(STORAGE_KEYS.ROOT_ITEMS) as FileSystemHandle[] | undefined;
            if (handles && Array.isArray(handles)) {
                const items: FileSystemItem[] = handles.map(h => ({
                    name: h.name,
                    path: h.name,
                    type: h.kind === 'directory' ? 'directory' : 'file',
                    children: [],
                    handle: h,
                }));
                setRootItemsState(items);
            }

            // Restore Tabs
            const storedTabs = await getFromDB(STORAGE_KEYS.OPEN_TABS) as EditorTab[] | undefined;
            if (storedTabs && storedTabs.length > 0) {
                // We just restore the metadata. The useEffect below will handle
                // getting the actual File objects once permissions are granted.
                setOpenTabs(storedTabs);
            }

            // Restore Active Tab Id
            const storedActiveTabId = await getFromDB<string>(STORAGE_KEYS.ACTIVE_TAB_ID);
            if (storedActiveTabId) {
                setActiveTabId(storedActiveTabId);
            }
        };
        restoreWorkspace();
    }, []);

    // Effect to re-load files for tabs when permission is granted
    useEffect(() => {
        const reloadFiles = async () => {
            const tabsToReload = openTabs.filter(tab => !tab.file && tab.handle);
            if (tabsToReload.length === 0) return;

            let changed = false;
            const updatedTabs = await Promise.all(openTabs.map(async (tab) => {
                if (!tab.file && tab.handle) {
                    try {
                        const status = await tab.handle.queryPermission({ mode: 'read' });
                        if (status === 'granted') {
                            const file = await tab.handle.getFile();
                            changed = true;
                            return { ...tab, file };
                        }
                    } catch (e) {
                        console.error('Failed to reload tab file:', e);
                    }
                }
                return tab;
            }));

            if (changed) {
                setOpenTabs(updatedTabs);
                saveToDB(STORAGE_KEYS.OPEN_TABS, updatedTabs);
            }
        };

        reloadFiles();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rootItems.length, openTabs.length]);

    const setRootItems = useCallback((items: FileSystemItem[]) => {
        setRootItemsState(items);
        // Persist handles
        const handles = items.map(item => item.handle);
        saveToDB(STORAGE_KEYS.ROOT_ITEMS, handles);
    }, []);

    const addWorkspaceItem = useCallback((item: FileSystemItem) => {
        setRootItemsState((prev) => {
            // Avoid duplicates by path
            if (prev.find(i => i.path === item.path)) return prev;
            const next = [...prev, item];
            saveToDB(STORAGE_KEYS.ROOT_ITEMS, next.map(i => i.handle));
            return next;
        });
    }, []);

    const removeWorkspaceItem = useCallback((path: string) => {
        setRootItemsState((prev) => {
            const next = prev.filter(i => i.path !== path);
            saveToDB(STORAGE_KEYS.ROOT_ITEMS, next.map(i => i.handle));
            return next;
        });
    }, []);

    const openFile = useCallback((item: FileSystemItem, file: File) => {
        // Check if file is already open
        const existingTab = openTabs.find((tab) => tab.path === item.path);
        if (existingTab) {
            setActiveTabId(existingTab.id);
            saveToDB(STORAGE_KEYS.ACTIVE_TAB_ID, existingTab.id);
            return;
        }

        // Create new tab
        const newTab: EditorTab = {
            id: `tab-${Date.now()}`,
            name: item.name,
            path: item.path,
            file,
            isDirty: false,
            handle: item.handle as FileSystemFileHandle,
        };

        setOpenTabs((prev) => {
            const next = [...prev, newTab];
            saveToDB(STORAGE_KEYS.OPEN_TABS, next);
            return next;
        });
        setActiveTabId(newTab.id);
        saveToDB(STORAGE_KEYS.ACTIVE_TAB_ID, newTab.id);
    }, [openTabs]);

    const closeTab = useCallback((tabId: string) => {
        setOpenTabs((prev) => {
            const newTabs = prev.filter((tab) => tab.id !== tabId);
            saveToDB(STORAGE_KEYS.OPEN_TABS, newTabs);

            // If closing active tab, switch to another tab
            if (activeTabId === tabId && newTabs.length > 0) {
                const closedIndex = prev.findIndex((tab) => tab.id === tabId);
                const newActiveIndex = Math.min(closedIndex, newTabs.length - 1);
                const nextActiveId = newTabs[newActiveIndex].id;
                setActiveTabId(nextActiveId);
                saveToDB(STORAGE_KEYS.ACTIVE_TAB_ID, nextActiveId);
            } else if (newTabs.length === 0) {
                setActiveTabId(null);
                saveToDB(STORAGE_KEYS.ACTIVE_TAB_ID, null);
            }

            return newTabs;
        });
    }, [activeTabId]);

    const setActiveTab = useCallback((tabId: string) => {
        setActiveTabId(tabId);
        saveToDB(STORAGE_KEYS.ACTIVE_TAB_ID, tabId);
    }, []);

    const addMessage = useCallback((message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
        const newMessage: ChatMessage = {
            ...message,
            id: crypto.randomUUID(),
            timestamp: new Date(),
        };
        setAgentMessages((prev) => [...prev, newMessage]);
        return newMessage.id;
    }, []);

    const updateMessage = useCallback((id: string, updates: Partial<ChatMessage>) => {
        setAgentMessages((prev) =>
            prev.map(msg => msg.id === id ? { ...msg, ...updates } : msg)
        );
    }, []);

    const togglePanel = useCallback(() => {
        setIsPanelOpen((prev) => !prev);
    }, []);

    const setAIActionHandlerSafe = useCallback((handler: AIActionHandler | null) => {
        setAIActionHandler(() => handler);
    }, []);

    const setVoiceToolHandlerSafe = useCallback((handler: VoiceToolHandler | null) => {
        setVoiceToolHandler(() => handler);
    }, []);

    const setAttachedSelection = useCallback((selection: AttachedSelection | null) => {
        setAttachedSelectionState(selection);
        // Open panel when attaching a selection
        if (selection) {
            setIsPanelOpen(true);
        }
    }, []);

    const clearAttachedSelection = useCallback(() => {
        setAttachedSelectionState(null);
    }, []);

    return (
        <WorkspaceContext.Provider
            value={{
                rootItems,
                openTabs,
                activeTabId,
                agentMessages,
                isPanelOpen,
                setRootItems,
                addWorkspaceItem,
                removeWorkspaceItem,
                openFile,
                closeTab,
                setActiveTab,
                addMessage,
                updateMessage,
                togglePanel,
                aiActionHandler,
                setAIActionHandler: setAIActionHandlerSafe,
                voiceToolHandler,
                setVoiceToolHandler: setVoiceToolHandlerSafe,
                attachedSelection,
                setAttachedSelection,
                clearAttachedSelection,
                activeOutline,
                setActiveOutline,
                navRequest,
                setNavRequest,
            }}
        >
            {children}
        </WorkspaceContext.Provider>
    );
}

export function useWorkspace() {
    const context = useContext(WorkspaceContext);
    if (!context) {
        throw new Error('useWorkspace must be used within a WorkspaceProvider');
    }
    return context;
}

