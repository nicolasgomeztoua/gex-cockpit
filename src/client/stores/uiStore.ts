import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TickerKey } from "../theme";

interface UiState {
  sidebarOpen: boolean;
  /** which ticker the sidebar layer sections configure */
  scope: TickerKey;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setScope: (scope: TickerKey) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    set => ({
      sidebarOpen: true,
      scope: "NDX",
      setSidebarOpen: sidebarOpen => set({ sidebarOpen }),
      toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),
      setScope: scope => set({ scope }),
    }),
    { name: "gex-cockpit-ui-v2" },
  ),
);
