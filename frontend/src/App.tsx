import { useEffect, useState } from 'react';
import { WorkbenchLayout } from './components/workbench/WorkbenchLayoutMantine';
import { DashboardPage } from './components/dashboard/DashboardPage';
import { FormulaPage } from './components/formulas/FormulaPage';
import { ScenarioPage } from './components/scenarios/ScenarioPage';
import { healthCheck } from './lib/api';
import { useEditorStore } from './state/editorStore';

export default function App() {
  const runValidate = useEditorStore((s) => s.runValidate);
  const setBackendHealthy = useEditorStore((s) => s.setBackendHealthy);
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    void runValidate();
    void healthCheck()
      .then(() => setBackendHealthy(true))
      .catch(() => setBackendHealthy(false));
  }, [runValidate, setBackendHealthy]);

  useEffect(() => {
    const onLocationChange = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onLocationChange);
    return () => window.removeEventListener('popstate', onLocationChange);
  }, []);

  if (path === '/dashboard') return <DashboardPage />;
  if (path === '/formulas') return <FormulaPage />;
  if (path === '/scenarios') return <ScenarioPage />;
  return <WorkbenchLayout />;
}
