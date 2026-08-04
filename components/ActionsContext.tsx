"use client";

import { createContext, useContext } from "react";
import {
  completeQuest,
  undoCompletion,
  verifyClaim,
  declineClaim,
  createQuest,
  createEpic,
  chooseTitle,
  setCharacterName,
} from "@/app/actions";

/**
 * The write surface, injectable.
 *
 * Components call `useActions()` rather than importing the Server Actions
 * directly, so a harness can substitute in-memory stubs and drive the real
 * UI without a database. The DEFAULT is the real action set — production
 * behaviour is unchanged and nothing here can weaken a server-side check,
 * because the checks live in app/actions.ts where they always did.
 *
 * This exists because the authenticated UI could not otherwise be
 * exercised at all from a sandbox with no route to Supabase: every panel
 * shipped render-untested. See scratchpad harness + app/preview.
 */
export type ActionSet = {
  completeQuest: typeof completeQuest;
  undoCompletion: typeof undoCompletion;
  verifyClaim: typeof verifyClaim;
  declineClaim: typeof declineClaim;
  createQuest: typeof createQuest;
  createEpic: typeof createEpic;
  chooseTitle: typeof chooseTitle;
  setCharacterName: typeof setCharacterName;
};

const REAL_ACTIONS: ActionSet = {
  completeQuest,
  undoCompletion,
  verifyClaim,
  declineClaim,
  createQuest,
  createEpic,
  chooseTitle,
  setCharacterName,
};

const ActionsContext = createContext<ActionSet>(REAL_ACTIONS);

export function ActionsProvider({
  actions,
  children,
}: {
  actions: ActionSet;
  children: React.ReactNode;
}) {
  return (
    <ActionsContext.Provider value={actions}>{children}</ActionsContext.Provider>
  );
}

export function useActions(): ActionSet {
  return useContext(ActionsContext);
}
