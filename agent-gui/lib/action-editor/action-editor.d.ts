import type { JSX as ReactJSX } from "react";

declare global {
  namespace JSX {
    type Element = ReactJSX.Element;
    type IntrinsicElements = ReactJSX.IntrinsicElements;
  }
}

declare module "monaco-editor/esm/vs/basic-languages/csharp/csharp.js" {
  import type * as Monaco from "monaco-editor";
  export const conf: Monaco.languages.LanguageConfiguration;
  export const language: Monaco.languages.IMonarchLanguage;
}

export {};
