"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  parseActionDesignerEmbedFromSearchParams,
  type ActionDesignerEmbedParams,
} from "@/lib/action-designer-embed";

const disabledEmbed = parseActionDesignerEmbedFromSearchParams(
  new URLSearchParams(),
);

const DesignerEmbedContext =
  createContext<ActionDesignerEmbedParams>(disabledEmbed);

export function DesignerEmbedProvider({
  value,
  children,
}: {
  value: ActionDesignerEmbedParams;
  children: ReactNode;
}) {
  return (
    <DesignerEmbedContext.Provider value={value}>
      {children}
    </DesignerEmbedContext.Provider>
  );
}

export function useActionDesignerEmbed(): ActionDesignerEmbedParams {
  return useContext(DesignerEmbedContext);
}
