import { useEffect } from 'react';
import { WorkbenchLayout } from './components/workbench/WorkbenchLayoutMantine';
import { healthCheck } from './lib/api';
import { useEditorStore } from './state/editorStore';

export default function App() {
  const runValidate = useEditorStore((s) => s.runValidate);

  useEffect(() => {
    void runValidate();
    void healthCheck().catch(() => undefined);
  }, [runValidate]);

  return <WorkbenchLayout />;
}
