"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import {
  useBenchChatController,
  type BenchChatController,
} from "@/lib/use-bench-chat-controller";

const BenchChatContext = createContext<BenchChatController | null>(null);

export function useBenchChat(): BenchChatController {
  const ctx = useContext(BenchChatContext);
  if (!ctx) throw new Error("BenchChatContext missing");
  return ctx;
}

type BenchChatProviderProps = {
  children: ReactNode;
  disabled?: boolean;
};

export function BenchChatProvider({ children, disabled }: BenchChatProviderProps) {
  const controller = useBenchChatController({ disabled });

  return (
    <BenchChatContext.Provider value={controller}>
      {children}
    </BenchChatContext.Provider>
  );
}
