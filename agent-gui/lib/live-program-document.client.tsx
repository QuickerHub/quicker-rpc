"use client";

import { createContext, useContext } from "react";
import type { LiveProgramDocumentRegistry } from "./live-program-document";

const LiveProgramDocumentRegistryContext = createContext<LiveProgramDocumentRegistry | null>(null);
export const LiveProgramDocumentRegistryProvider = LiveProgramDocumentRegistryContext.Provider;
export function useLiveProgramDocumentRegistry(): LiveProgramDocumentRegistry | null {
  return useContext(LiveProgramDocumentRegistryContext);
}
