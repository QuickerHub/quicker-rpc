"use client";

import { createContext, useContext } from "react";
import type { WorkspaceDocumentOwner } from "./workspace-document-instances";

/** A presentation ticket only. File instances and editable history remain in the existing workbench owner. */
export type WorkspaceDocumentNavigationTicket = {
  cwd: string;
  owner: WorkspaceDocumentOwner;
  isCurrent: () => boolean;
  openFile: (path: string, label?: string) => boolean;
};
export type WorkspaceDocumentNavigation = { owner: WorkspaceDocumentOwner; capture: () => WorkspaceDocumentNavigationTicket | undefined };
export const WorkspaceDocumentNavigationContext = createContext<WorkspaceDocumentNavigation | null>(null);
export function useWorkspaceDocumentNavigation() { return useContext(WorkspaceDocumentNavigationContext); }
