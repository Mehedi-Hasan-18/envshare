import { create } from "zustand";
import { persist } from "zustand/middleware";

type TeamKeyMap = Record<string, string>;

type TeamKeyStore = {
  keys: TeamKeyMap;
  setKey: (teamId: string, key: string) => void;
  getKey: (teamId: string) => string | undefined;
  clearKey: (teamId: string) => void;
};

export const useTeamKeyStore = create<TeamKeyStore>()(
  persist(
    (set, get) => ({
      keys: {},
      setKey: (teamId, key) =>
        set((state) => ({
          keys: { ...state.keys, [teamId]: key },
        })),
      getKey: (teamId) => get().keys[teamId],
      clearKey: (teamId) =>
        set((state) => {
          const next = { ...state.keys };
          delete next[teamId];
          return { keys: next };
        }),
    }),
    {
      name: "envshare-team-keys",
    },
  ),
);
