let configured = false;

/** Configure Monaco workers without bundling worker entrypoints (avoids Next.js glob EPERM on Windows). */
export function configureMonacoWorkers(): void {
  if (configured || typeof window === "undefined") {
    return;
  }
  configured = true;

  const globalSelf = self as typeof self & {
    MonacoEnvironment?: {
      getWorkerUrl: (moduleId: string, label: string) => string;
    };
  };

  globalSelf.MonacoEnvironment = {
    getWorkerUrl(_moduleId: string, label: string): string {
      const base = "https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs";
      if (label === "json") {
        return `${base}/language/json/json.worker.js`;
      }
      return `${base}/editor/editor.worker.js`;
    },
  };
}
