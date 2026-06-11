"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { dispatchWorkspaceLayoutResize } from "@/lib/embedded-webview-bounds";
import {
  getTerminalSessionClient,
  warmupXtermChunks,
  type TerminalSessionSnapshot,
} from "@/lib/terminal-session-client";

type EmbeddedXtermProps = {
  terminalId: string;
  cwd: string;
  visible?: boolean;
  className?: string;
  style?: CSSProperties;
};

/** Interactive xterm.js pane backed by a persistent TerminalSessionClient. */
export function EmbeddedXterm({
  terminalId,
  cwd,
  visible = true,
  className,
  style,
}: EmbeddedXtermProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<import("@xterm/xterm").Terminal | null>(null);
  const fitAddonRef = useRef<import("@xterm/addon-fit").FitAddon | null>(null);
  const bootedRef = useRef(false);
  const [runtime, setRuntime] = useState<TerminalSessionSnapshot>({
    phase: "idle",
    sessionId: terminalId,
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host || bootedRef.current) return;

    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    const client = getTerminalSessionClient(terminalId, cwd);

    const fitTerminal = () => {
      const term = termRef.current;
      const fitAddon = fitAddonRef.current;
      if (!term || !fitAddon) return;
      fitAddon.fit();
      client.resize(term.cols, term.rows);
    };

    const boot = async () => {
      const unsubState = client.subscribeState((snapshot) => {
        setRuntime(snapshot);
      });

      let term: import("@xterm/xterm").Terminal | null = null;
      const unsubOutput = client.subscribeOutput((data) => {
        term?.write(data);
      });

      void client.ensureConnected(80, 24).catch(() => {});

      const xtermModules = (await warmupXtermChunks()) as [
        typeof import("@xterm/xterm"),
        typeof import("@xterm/addon-fit"),
      ];
      const [{ Terminal }, { FitAddon }] = xtermModules;
      if (disposed || !hostRef.current || bootedRef.current) {
        unsubState();
        unsubOutput();
        return;
      }

      term = new Terminal({
        cursorBlink: true,
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 12,
        lineHeight: 1.2,
        theme: {
          background: "#111318",
          foreground: "#e6e8ee",
          cursor: "#8ab4ff",
          selectionBackground: "#3a4f78",
        },
        scrollback: 5000,
      });
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(hostRef.current);
      fitAddon.fit();

      termRef.current = term;
      fitAddonRef.current = fitAddon;
      bootedRef.current = true;

      term.onData((data) => {
        client.write(data);
      });

      resizeObserver = new ResizeObserver(() => {
        fitTerminal();
        dispatchWorkspaceLayoutResize();
      });
      resizeObserver.observe(hostRef.current);

      client.resize(term.cols, term.rows);

      return () => {
        unsubState();
        unsubOutput();
      };
    };

    let cleanupBoot: (() => void) | undefined;
    void boot().then((cleanup) => {
      cleanupBoot = cleanup;
    });

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      cleanupBoot?.();
      termRef.current?.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
      bootedRef.current = false;
    };
  }, [terminalId, cwd]);

  useEffect(() => {
    if (!visible || !bootedRef.current) return;
    const term = termRef.current;
    const fitAddon = fitAddonRef.current;
    if (!term || !fitAddon) return;
    requestAnimationFrame(() => {
      fitAddon.fit();
      getTerminalSessionClient(terminalId, cwd).resize(term.cols, term.rows);
      term.focus();
    });
  }, [visible, terminalId, cwd]);

  return (
    <div
      className={className}
      style={style}
      data-terminal-phase={runtime.phase}
      hidden={!visible ? true : undefined}
    >
      {runtime.phase === "connecting" ? (
        <div className="workspace-embedded-terminal__status">正在连接终端…</div>
      ) : null}
      {runtime.phase === "error" && runtime.errorMessage ? (
        <div className="workspace-embedded-terminal__error" role="alert">
          {runtime.errorMessage}
        </div>
      ) : null}
      <div
        ref={hostRef}
        className="workspace-embedded-terminal__xterm-host"
        tabIndex={0}
        aria-label="终端"
      />
    </div>
  );
}
