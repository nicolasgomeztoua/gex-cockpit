import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TickerKey } from "../theme";

export type SidebarView = "main" | "settings" | "alerts";

export const SIDEBAR_MIN_W = 240;
export const SIDEBAR_MAX_W = 520;

interface UiState {
  sidebarOpen: boolean;
  sidebarWidth: number;
  /** which panel the sidebar shows (gexbot-style: main → gear → settings → bell → alerts) */
  sidebarView: SidebarView;
  /** true while the resize handle is being dragged (disables the width transition) */
  resizing: boolean;
  /** which ticker the sidebar layer sections configure */
  scope: TickerKey;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setSidebarWidth: (px: number) => void;
  setSidebarView: (view: SidebarView) => void;
  setResizing: (resizing: boolean) => void;
  setScope: (scope: TickerKey) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    set => ({
      sidebarOpen: true,
      sidebarWidth: 320,
      sidebarView: "main",
      resizing: false,
      scope: "NDX",
      setSidebarOpen: sidebarOpen => set({ sidebarOpen }),
      toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),
      setSidebarWidth: px =>
        set({ sidebarWidth: Math.min(SIDEBAR_MAX_W, Math.max(SIDEBAR_MIN_W, Math.round(px))) }),
      setSidebarView: sidebarView => set({ sidebarView }),
      setResizing: resizing => set({ resizing }),
      setScope: scope => set({ scope }),
    }),
    {
      name: "gex-cockpit-ui-v2",
      partialize: s => ({
        sidebarOpen: s.sidebarOpen,
        sidebarWidth: s.sidebarWidth,
        scope: s.scope,
      }),
    },
  ),
);
