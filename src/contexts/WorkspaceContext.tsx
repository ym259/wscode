'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { FileSystemItem, EditorTab, ChatMessage, WorkspaceState } from '@/types';

import { ToolCall, AgentEvent } from '@/types';

// --- IndexedDB Helpers ---
const DB_NAME = 'EditorDB';
const STORE_NAME = 'handles';
const ROOT_ITEMS_KEY = 'root_items_handles';
const OPEN_TABS_KEY = 'open_tabs';
const ACTIVE_TAB_ID_KEY = 'active_tab_id';

const initDB = (): Promise<IDBDatabase> => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
        return Promise.reject(new Error('IndexedDB not supported'));
    }
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

const saveToDB = async (key: string, value: any) => {
    try {
        const db = await initDB();
        return new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            if (value !== null && value !== undefined) {
                store.put(value, key);
            } else {
                store.delete(key);
            }
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch (e) {
        console.error('Failed to save to IDB:', e);
    }
};

const getFromDB = async (key: string): Promise<any> => {
    try {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        console.error('Failed to get from IDB:', e);
        return undefined;
    }
};
// -------------------------

// Type for the AI action handler function
export type AIActionHandler = (
    prompt: string,
    history: ChatMessage[],
    onUpdate: (event: AgentEvent) => void
) => Promise<void>;

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
}

const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
    const [rootItems, setRootItemsState] = useState<FileSystemItem[]>([]);
    const [openTabs, setOpenTabs] = useState<EditorTab[]>([]);
    const [activeTabId, setActiveTabId] = useState<string | null>(null);
    const [agentMessages, setAgentMessages] = useState<ChatMessage[]>([]);
    const [isPanelOpen, setIsPanelOpen] = useState(true);
    const [aiActionHandler, setAIActionHandler] = useState<AIActionHandler | null>(null);

    // Load workspace state from IDB on mount
    useEffect(() => {
        const restoreWorkspace = async () => {
            // Restore Root Items
            const handles = await getFromDB(ROOT_ITEMS_KEY) as FileSystemHandle[] | undefined;
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
            const storedTabs = await getFromDB(OPEN_TABS_KEY) as EditorTab[] | undefined;
            if (storedTabs && storedTabs.length > 0) {
                // We just restore the metadata. The useEffect below will handle
                // getting the actual File objects once permissions are granted.
                setOpenTabs(storedTabs);
            }

            // Restore Active Tab Id
            const storedActiveTabId = await getFromDB(ACTIVE_TAB_ID_KEY);
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
                saveToDB(OPEN_TABS_KEY, updatedTabs);
            }
        };

        reloadFiles();
    }, [rootItems.length, openTabs.length]);

    const setRootItems = useCallback((items: FileSystemItem[]) => {
        setRootItemsState(items);
        // Persist handles
        const handles = items.map(item => item.handle);
        saveToDB(ROOT_ITEMS_KEY, handles);
    }, []);

    const addWorkspaceItem = useCallback((item: FileSystemItem) => {
        setRootItemsState((prev) => {
            // Avoid duplicates by path
            if (prev.find(i => i.path === item.path)) return prev;
            const next = [...prev, item];
            saveToDB(ROOT_ITEMS_KEY, next.map(i => i.handle));
            return next;
        });
    }, []);

    const removeWorkspaceItem = useCallback((path: string) => {
        setRootItemsState((prev) => {
            const next = prev.filter(i => i.path !== path);
            saveToDB(ROOT_ITEMS_KEY, next.map(i => i.handle));
            return next;
        });
    }, []);

    const openFile = useCallback((item: FileSystemItem, file: File) => {
        // Check if file is already open
        const existingTab = openTabs.find((tab) => tab.path === item.path);
        if (existingTab) {
            setActiveTabId(existingTab.id);
            saveToDB(ACTIVE_TAB_ID_KEY, existingTab.id);
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
            saveToDB(OPEN_TABS_KEY, next);
            return next;
        });
        setActiveTabId(newTab.id);
        saveToDB(ACTIVE_TAB_ID_KEY, newTab.id);
    }, [openTabs]);

    const closeTab = useCallback((tabId: string) => {
        setOpenTabs((prev) => {
            const newTabs = prev.filter((tab) => tab.id !== tabId);
            saveToDB(OPEN_TABS_KEY, newTabs);

            // If closing active tab, switch to another tab
            if (activeTabId === tabId && newTabs.length > 0) {
                const closedIndex = prev.findIndex((tab) => tab.id === tabId);
                const newActiveIndex = Math.min(closedIndex, newTabs.length - 1);
                const nextActiveId = newTabs[newActiveIndex].id;
                setActiveTabId(nextActiveId);
                saveToDB(ACTIVE_TAB_ID_KEY, nextActiveId);
            } else if (newTabs.length === 0) {
                setActiveTabId(null);
                saveToDB(ACTIVE_TAB_ID_KEY, null);
            }

            return newTabs;
        });
    }, [activeTabId]);

    const setActiveTab = useCallback((tabId: string) => {
        setActiveTabId(tabId);
        saveToDB(ACTIVE_TAB_ID_KEY, tabId);
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

