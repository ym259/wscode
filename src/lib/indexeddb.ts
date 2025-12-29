/**
 * IndexedDB utilities for persistent storage
 * @module lib/indexeddb
 */

/** Database name for the editor storage */
export const DB_NAME = 'EditorDB';

/** Object store name for storing handles and data */
export const STORE_NAME = 'handles';

/** Storage keys */
export const STORAGE_KEYS = {
    ROOT_ITEMS: 'root_items_handles',
    OPEN_TABS: 'open_tabs',
    ACTIVE_TAB_ID: 'active_tab_id',
    SETTINGS_OVERWRITE_ENABLED: 'settings_overwrite_enabled',
    LIBRARY_FILES: 'library_files',
} as const;

/**
 * Initialize the IndexedDB database
 * @returns Promise resolving to the database instance
 */
export const initDB = (): Promise<IDBDatabase> => {
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

/**
 * Save a value to IndexedDB
 * @param key - Storage key
 * @param value - Value to store (null/undefined will delete the key)
 */
export const saveToDB = async (key: string, value: unknown): Promise<void> => {
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

/**
 * Get a value from IndexedDB
 * @param key - Storage key
 * @returns Promise resolving to the stored value, or undefined if not found
 */
export const getFromDB = async <T = unknown>(key: string): Promise<T | undefined> => {
    try {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result as T);
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        console.error('Failed to get from IDB:', e);
        return undefined;
    }
};
