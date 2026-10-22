import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SidebarState {
  collapsedEdges: Record<string, boolean>;
  toggleEdge: (edgeId: string) => void;
}

export const useSidebar = create<SidebarState>()(
  persist(
    (set) => ({
      collapsedEdges: {},
      toggleEdge: (edgeId) =>
        set((state) => ({
          collapsedEdges: {
            ...state.collapsedEdges,
            [edgeId]: !state.collapsedEdges[edgeId],
          },
        })),
    }),
    {
      name: "paimon:sidebar",
      partialize: (state) => ({ collapsedEdges: state.collapsedEdges }),
    },
  ),
);
