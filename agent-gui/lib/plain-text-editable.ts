/** React props that disable OS/browser spell & grammar checking in plain-text editors. */
export const plainTextEditableProps = {
  spellCheck: false,
  autoCorrect: "off",
  autoCapitalize: "off",
  translate: "no",
  lang: "und",
  "data-gramm": "false",
  "data-gramm_editor": "false",
  "data-enable-grammarly": "false",
  "data-ms-editor": "false",
} as const;

/** Re-apply on mount — some WebView2 builds ignore React spellCheck until the property is set on the DOM node. */
export function applyPlainTextEditableDom(el: HTMLElement | null): void {
  if (!el) return;
  el.spellcheck = false;
  el.setAttribute("spellcheck", "false");
  el.setAttribute("autocorrect", "off");
  el.setAttribute("autocapitalize", "off");
  el.setAttribute("autocomplete", "off");
  el.setAttribute("translate", "no");
  el.setAttribute("lang", "und");
  el.setAttribute("data-gramm", "false");
  el.setAttribute("data-gramm_editor", "false");
  el.setAttribute("data-enable-grammarly", "false");
  el.setAttribute("data-ms-editor", "false");
}
