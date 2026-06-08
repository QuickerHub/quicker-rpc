"use client";

import { useEffect } from "react";
import type { ClientFrontendErrorReport } from "@/lib/dev-frontend-types";

const REPORT_ENDPOINT = "/api/dev/frontend-errors";
const FLUSH_MS = 800;
export const REACT_HOOKS_FAULT_EVENT = "qa-react-hooks-fault";

function isReactHooksFaultMessage(message: string): boolean {
  return (
    message.includes("order of Hooks")
    || message.includes("Should have a queue")
    || message.includes("invalid-hook-call")
  );
}

/** HMR can break React handlers while native navigation (<a href>) still works. */
function isDevInteractionFaultMessage(message: string): boolean {
  if (isReactHooksFaultMessage(message)) return true;
  if (message.includes("Maximum update depth exceeded")) return true;
  if (message.includes("Component is not a function")) return true;
  if (!message.includes("ReferenceError")) return false;
  return message.includes(" is not defined");
}

function notifyDevInteractionFault(message: string): void {
  if (!isDevInteractionFaultMessage(message)) return;
  window.dispatchEvent(new CustomEvent(REACT_HOOKS_FAULT_EVENT, { detail: { message } }));
}

function shouldCapture(): boolean {
  return process.env.NODE_ENV === "development";
}

function queueReport(report: ClientFrontendErrorReport): void {
  pending.push(report);
  scheduleFlush();
}

const pending: ClientFrontendErrorReport[] = [];
let flushTimer: number | undefined;

function scheduleFlush(): void {
  if (flushTimer !== undefined) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = undefined;
    void flushReports();
  }, FLUSH_MS);
}

async function flushReports(): Promise<void> {
  if (pending.length === 0) return;
  const batch = pending.splice(0, pending.length);
  try {
    await fetch(REPORT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ errors: batch }),
      keepalive: true,
    });
  } catch {
    pending.unshift(...batch);
  }
}

export function DevErrorCapture() {
  useEffect(() => {
    if (!shouldCapture()) return;

    const pageUrl = window.location.href;

    const onError = (event: ErrorEvent) => {
      const message = event.message || "Unknown error";
      notifyDevInteractionFault(message);
      queueReport({
        kind: "error",
        message,
        stack: event.error instanceof Error ? event.error.stack : undefined,
        source: event.filename,
        line: event.lineno,
        col: event.colno,
        url: pageUrl,
        at: new Date().toISOString(),
      });
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      queueReport({
        kind: "unhandledrejection",
        message:
          reason instanceof Error
            ? reason.message
            : typeof reason === "string"
              ? reason
              : "Unhandled promise rejection",
        stack: reason instanceof Error ? reason.stack : undefined,
        url: pageUrl,
        at: new Date().toISOString(),
      });
    };

    const originalConsoleError = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      originalConsoleError(...args);
      const message = args
        .map((arg) => {
          if (arg instanceof Error) return arg.message;
          if (typeof arg === "string") return arg;
          try {
            return JSON.stringify(arg);
          } catch {
            return String(arg);
          }
        })
        .join(" ")
        .trim();
      if (!message) return;
      notifyDevInteractionFault(message);
      queueReport({
        kind: "console",
        message: message.slice(0, 4000),
        url: pageUrl,
        at: new Date().toISOString(),
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      console.error = originalConsoleError;
      if (flushTimer !== undefined) {
        window.clearTimeout(flushTimer);
        flushTimer = undefined;
      }
      void flushReports();
    };
  }, []);

  return null;
}
