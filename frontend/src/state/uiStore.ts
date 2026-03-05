import { create } from 'zustand';
import type { MfaMissingValueRule, MfaTimeUnit } from '../lib/mfaExport';

export type FlyoutPanel = 'components' | 'outline' | 'variables' | 'settings' | 'data' | null;

type UIState = {
  leftRailCollapsed: boolean;
  rightRailCollapsed: boolean;
  showFunctionInternals: boolean;
  showMinimap: boolean;
  showXmlModel: boolean;
  curvedEdges: boolean;
  bottomTrayExpanded: boolean;
  bottomTrayHeight: number;
  selectedMfaTimestamp: number | null;
  mfaTimeAnchorDate: string;
  mfaTimeUnit: MfaTimeUnit;
  mfaMissingValueRule: MfaMissingValueRule;
  activeFlyout: FlyoutPanel;
  toggleLeftRail: () => void;
  toggleRightRail: () => void;
  openRightRail: () => void;
  toggleFunctionInternals: () => void;
  toggleMinimap: () => void;
  toggleXmlModel: () => void;
  toggleCurvedEdges: () => void;
  toggleBottomTray: () => void;
  expandBottomTray: () => void;
  setBottomTrayHeight: (height: number) => void;
  setSelectedMfaTimestamp: (timestamp: number | null) => void;
  setMfaTimeAnchorDate: (anchorDate: string) => void;
  setMfaTimeUnit: (timeUnit: MfaTimeUnit) => void;
  setMfaMissingValueRule: (rule: MfaMissingValueRule) => void;
  setActiveFlyout: (panel: FlyoutPanel) => void;
  toggleFlyout: (panel: FlyoutPanel) => void;
};

export const useUIStore = create<UIState>((set) => ({
  leftRailCollapsed: false,
  rightRailCollapsed: false,
  showFunctionInternals: false,
  showMinimap: false,
  showXmlModel: false,
  curvedEdges: false,
  bottomTrayExpanded: true,
  bottomTrayHeight: 230,
  selectedMfaTimestamp: null,
  mfaTimeAnchorDate: '',
  mfaTimeUnit: 'day',
  mfaMissingValueRule: 'carry_forward',
  activeFlyout: null,
  toggleLeftRail: () => set((s) => ({ leftRailCollapsed: !s.leftRailCollapsed })),
  toggleRightRail: () => set((s) => ({ rightRailCollapsed: !s.rightRailCollapsed })),
  openRightRail: () => set(() => ({ rightRailCollapsed: false })),
  toggleFunctionInternals: () => set((s) => ({ showFunctionInternals: !s.showFunctionInternals })),
  toggleMinimap: () => set((s) => ({ showMinimap: !s.showMinimap })),
  toggleXmlModel: () => set((s) => ({ showXmlModel: !s.showXmlModel })),
  toggleCurvedEdges: () => set((s) => ({ curvedEdges: !s.curvedEdges })),
  toggleBottomTray: () => set((s) => ({ bottomTrayExpanded: !s.bottomTrayExpanded })),
  expandBottomTray: () => set({ bottomTrayExpanded: true }),
  setBottomTrayHeight: (height) =>
    set(() => ({ bottomTrayHeight: Math.max(160, Math.min(560, Math.round(height))) })),
  setSelectedMfaTimestamp: (timestamp) => set(() => ({ selectedMfaTimestamp: timestamp })),
  setMfaTimeAnchorDate: (anchorDate) => set(() => ({ mfaTimeAnchorDate: anchorDate })),
  setMfaTimeUnit: (timeUnit) => set(() => ({ mfaTimeUnit: timeUnit })),
  setMfaMissingValueRule: (rule) => set(() => ({ mfaMissingValueRule: rule })),
  setActiveFlyout: (panel) => set({ activeFlyout: panel }),
  toggleFlyout: (panel) => set((s) => ({ activeFlyout: s.activeFlyout === panel ? null : panel })),
}));
