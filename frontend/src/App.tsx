import { useEffect } from 'react';
import { WorkbenchLayout } from './components/workbench/WorkbenchLayoutMantine';
import { healthCheck } from './lib/api';
import { useEditorStore } from './state/editorStore';
import type { WorkbenchTab } from './state/editorStore';

const PATH_TO_TAB: Record<string, WorkbenchTab> = {
  '/formulas': 'formulas',
  '/dashboard': 'dashboard',
  '/scenarios': 'scenarios',
};

export default function App() {
  const runValidate = useEditorStore((s) => s.runValidate);
  const setBackendHealthy = useEditorStore((s) => s.setBackendHealthy);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);

  useEffect(() => {
    void runValidate();
    void healthCheck()
      .then(() => setBackendHealthy(true))
      .catch(() => setBackendHealthy(false));
  }, [runValidate, setBackendHealthy]);

  // Map initial URL path to tab on mount
  useEffect(() => {
    const tab = PATH_TO_TAB[window.location.pathname];
    if (tab) setActiveTab(tab);
  }, [setActiveTab]);

  return <WorkbenchLayout />;
}
