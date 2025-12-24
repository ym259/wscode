'use client';

import { useState } from 'react';
import { WorkspaceProvider, useWorkspace } from '@/contexts/WorkspaceContext';
import ActivityBar from '@/components/layout/ActivityBar';
import StatusBar from '@/components/layout/StatusBar';
import FileExplorer from '@/components/explorer/FileExplorer';
import EditorPanel from '@/components/editor/EditorPanel';
import AgentPanel from '@/components/agent/AgentPanel';
import { Sparkles } from 'lucide-react';
import styles from './page.module.css';

function IDELayout() {
  const { isPanelOpen, togglePanel } = useWorkspace();
  const [activeView, setActiveView] = useState('explorer');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const handleViewChange = (view: string) => {
    if (view === activeView) {
      setIsSidebarOpen(!isSidebarOpen);
    } else {
      setActiveView(view);
      setIsSidebarOpen(true);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.main}>
        <ActivityBar
          activeView={activeView}
          onViewChange={handleViewChange}
        />

        {isSidebarOpen && (
          <div className={styles.sidebar}>
            {activeView === 'explorer' && <FileExplorer onClose={() => setIsSidebarOpen(false)} />}
            {activeView === 'search' && (
              <div className={styles.placeholder}>
                <p>Search</p>
                <span>Coming soon</span>
              </div>
            )}
            {activeView === 'git' && (
              <div className={styles.placeholder}>
                <p>Source Control</p>
                <span>Coming soon</span>
              </div>
            )}
          </div>
        )}

        <div className={styles.editor}>
          <EditorPanel />
        </div>

        {isPanelOpen && (
          <div className={styles.panel}>
            <AgentPanel isOpen={isPanelOpen} onClose={togglePanel} />
          </div>
        )}
      </div>

      {!isPanelOpen && (
        <button
          className={styles.floatingChatToggle}
          onClick={togglePanel}
          title="Open AI Assistant"
        >
          <Sparkles size={24} />
        </button>
      )}

      <StatusBar />
    </div>
  );
}

export default function Home() {
  return (
    <WorkspaceProvider>
      <IDELayout />
    </WorkspaceProvider>
  );
}
