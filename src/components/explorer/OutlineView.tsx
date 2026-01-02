'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import styles from './OutlineView.module.css';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface OutlineItem {
    id: string;
    text: string;
    level: number;
}

interface TreeItem extends OutlineItem {
    children: TreeItem[];
}

interface OutlineViewProps {
    onResizeStart?: () => void;
    onExpandedChange?: (expanded: boolean) => void;
}

// Build hierarchical tree from flat outline
function buildTree(items: OutlineItem[]): TreeItem[] {
    const root: TreeItem[] = [];
    const stack: TreeItem[] = [];

    for (const item of items) {
        const treeItem: TreeItem = { ...item, children: [] };

        // Pop items from stack until we find a parent (lower level)
        while (stack.length > 0 && stack[stack.length - 1].level >= item.level) {
            stack.pop();
        }

        if (stack.length === 0) {
            root.push(treeItem);
        } else {
            stack[stack.length - 1].children.push(treeItem);
        }

        stack.push(treeItem);
    }

    return root;
}

interface OutlineTreeItemProps {
    item: TreeItem;
    minLevel: number;
    collapsedIds: Set<string>;
    onToggle: (id: string) => void;
    onNavigate: (id: string) => void;
}

function OutlineTreeItem({ item, minLevel, collapsedIds, onToggle, onNavigate }: OutlineTreeItemProps) {
    const hasChildren = item.children.length > 0;
    const isCollapsed = collapsedIds.has(item.id);
    // Normalize indentation: minLevel gets no indent, higher levels indent relative to it
    const indent = (item.level - minLevel) * 16 + 8;

    return (
        <>
            <div
                className={styles.item}
                style={{ paddingLeft: `${indent}px` }}
                title={item.text}
            >
                {hasChildren ? (
                    <button
                        className={styles.chevronButton}
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggle(item.id);
                        }}
                    >
                        {isCollapsed ? (
                            <ChevronRight size={14} />
                        ) : (
                            <ChevronDown size={14} />
                        )}
                    </button>
                ) : (
                    <span className={styles.chevronPlaceholder} />
                )}
                <span
                    className={`${styles.itemText} ${styles[`level${Math.min(item.level, 6)}`]}`}
                    onClick={() => onNavigate(item.id)}
                >
                    {item.text}
                </span>
            </div>
            {hasChildren && !isCollapsed && (
                <>
                    {item.children.map((child) => (
                        <OutlineTreeItem
                            key={child.id}
                            item={child}
                            minLevel={minLevel}
                            collapsedIds={collapsedIds}
                            onToggle={onToggle}
                            onNavigate={onNavigate}
                        />
                    ))}
                </>
            )}
        </>
    );
}

export default function OutlineView({ onResizeStart, onExpandedChange }: OutlineViewProps) {
    const { activeOutline, setNavRequest } = useWorkspace();
    const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
    const [isExpanded, setIsExpanded] = useState(true);

    const tree = useMemo(() => buildTree(activeOutline || []), [activeOutline]);

    // Find minimum level to normalize indentation
    const minLevel = useMemo(() => {
        if (!activeOutline || activeOutline.length === 0) return 1;
        return Math.min(...activeOutline.map(item => item.level));
    }, [activeOutline]);

    const handleToggle = useCallback((id: string) => {
        setCollapsedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }, []);

    const handleNavigate = useCallback((id: string) => {
        setNavRequest(id);
    }, [setNavRequest]);

    const handleExpandToggle = useCallback(() => {
        const newExpanded = !isExpanded;
        setIsExpanded(newExpanded);
        onExpandedChange?.(newExpanded);
    }, [isExpanded, onExpandedChange]);

    if (!activeOutline || activeOutline.length === 0) {
        return null;
    }

    return (
        <div className={`${styles.container} ${isExpanded ? '' : styles.collapsed}`}>
            {/* Draggable resize handle - only show when expanded */}
            {isExpanded && (
                <div
                    className={styles.resizeHandle}
                    onMouseDown={onResizeStart}
                />
            )}

            {/* Header - styled to match unified section pattern */}
            <div className={styles.header} onClick={handleExpandToggle}>
                <span className={styles.sectionChevron}>
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </span>
                <span className={styles.sectionTitle}>OUTLINE</span>
                <span className={styles.badge}>{activeOutline.length}</span>
            </div>

            {/* Content */}
            {isExpanded && (
                <div className={styles.content}>
                    {tree.map((item) => (
                        <OutlineTreeItem
                            key={item.id}
                            item={item}
                            minLevel={minLevel}
                            collapsedIds={collapsedIds}
                            onToggle={handleToggle}
                            onNavigate={handleNavigate}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

