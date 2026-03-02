import type { WorkbenchTab } from '../state/editorStore';
import { useEditorStore } from '../state/editorStore';

const TAB_MAP: Record<string, WorkbenchTab> = {
  '/': 'canvas',
  '/formulas': 'formulas',
  '/dashboard': 'dashboard',
  '/scenarios': 'scenarios',
};

export function navigateTo(path: string): void {
  const tab = TAB_MAP[path];
  if (tab) {
    useEditorStore.getState().setActiveTab(tab);
  }
}
