import { create } from 'zustand';

type UIState = {
  leftRailCollapsed: boolean;
  rightRailCollapsed: boolean;
  showFunctionInternals: boolean;
  showMinimap: boolean;
  bottomTrayExpanded: boolean;
  bottomTrayHeight: number;
  selectedMfaTimestamp: number | null;
  toggleLeftRail: () => void;
  toggleRightRail: () => void;
  toggleFunctionInternals: () => void;
  toggleMinimap: () => void;
  toggleBottomTray: () => void;
  setBottomTrayHeight: (height: number) => void;
  setSelectedMfaTimestamp: (timestamp: number | null) => void;
};

export const useUIStore = create<UIState>((set) => ({
  leftRailCollapsed: false,
  rightRailCollapsed: false,
  showFunctionInternals: false,
  showMinimap: false,
  bottomTrayExpanded: true,
  bottomTrayHeight: 230,
  selectedMfaTimestamp: null,
  toggleLeftRail: () => set((s) => ({ leftRailCollapsed: !s.leftRailCollapsed })),
  toggleRightRail: () => set((s) => ({ rightRailCollapsed: !s.rightRailCollapsed })),
  toggleFunctionInternals: () => set((s) => ({ showFunctionInternals: !s.showFunctionInternals })),
  toggleMinimap: () => set((s) => ({ showMinimap: !s.showMinimap })),
  toggleBottomTray: () => set((s) => ({ bottomTrayExpanded: !s.bottomTrayExpanded })),
  setBottomTrayHeight: (height) =>
    set(() => ({ bottomTrayHeight: Math.max(160, Math.min(560, Math.round(height))) })),
  setSelectedMfaTimestamp: (timestamp) => set(() => ({ selectedMfaTimestamp: timestamp })),
}));
