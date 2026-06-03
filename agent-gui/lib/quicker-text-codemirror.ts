import {
  HighlightStyle,
  LanguageSupport,
  StreamLanguage,
  syntaxHighlighting,
} from "@codemirror/language";
import { Tag } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";

/** `{varKey}` placeholder — not `{ var }` with surrounding spaces. */
const PLACEHOLDER = /\{[^{}\s][^{}]*\}/;
const GLOBALS = /\b(_qk|_context|_eval)\b/;

const quickerPrefixTag = Tag.define();
const quickerPlaceholderTag = Tag.define();
const quickerGlobalTag = Tag.define();

/** Align with quickerMonacoSetup PREFIX_RE — line-start expression markers. */
const quickerTextLanguageDefinition = StreamLanguage.define({
  name: "quicker-text",
  token(stream) {
    if (stream.sol()) {
      if (stream.match("$$")) return "quickerPrefix";
      if (stream.match("$=")) return "quickerPrefix";
    }
    if (stream.match(PLACEHOLDER)) return "quickerPlaceholder";
    if (stream.match(GLOBALS)) return "quickerGlobal";
    stream.next();
    return null;
  },
  tokenTable: {
    quickerPrefix: quickerPrefixTag,
    quickerPlaceholder: quickerPlaceholderTag,
    quickerGlobal: quickerGlobalTag,
  },
});

const quickerTextHighlightStyle = HighlightStyle.define([
  { tag: quickerPrefixTag, color: "var(--code-token-keyword)", fontWeight: "600" },
  { tag: quickerPlaceholderTag, color: "var(--code-token-selector)", fontWeight: "600" },
  { tag: quickerGlobalTag, color: "var(--code-token-selector)" },
]);

export function quickerTextCodeMirror(): Extension {
  return new LanguageSupport(quickerTextLanguageDefinition, [
    syntaxHighlighting(quickerTextHighlightStyle),
  ]);
}
