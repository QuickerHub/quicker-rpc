declare module "monaco-editor/esm/vs/basic-languages/csharp/csharp.js" {
  import type * as Monaco from "monaco-editor";
  export const conf: Monaco.languages.LanguageConfiguration;
  export const language: Monaco.languages.IMonarchLanguage;
}

declare module "monaco-editor/esm/vs/editor/editor.worker.js" {
  const WorkerFactory: { new (): Worker };
  export default WorkerFactory;
}

declare module "monaco-editor/esm/vs/language/json/json.worker.js" {
  const WorkerFactory: { new (): Worker };
  export default WorkerFactory;
}
