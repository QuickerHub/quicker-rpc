"use client";

import { createContext, useContext } from "react";

/** The existing document workspace owns visibility and keyboard suspension, including body portals. */
export const ProgramEditorModalContext = createContext<{
  active: boolean;
  keyboardOwnerId: string;
  setPickerOpen(open: boolean): void;
} | null>(null);

export const useProgramEditorModalOwner = () => useContext(ProgramEditorModalContext);
