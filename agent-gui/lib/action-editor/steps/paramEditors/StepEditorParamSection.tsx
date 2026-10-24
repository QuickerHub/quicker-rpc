import { useId, type JSX, type ReactNode } from "react";

/** Native FieldGroupExpander layout; expanding changes the view, never the parameter draft. */
export function StepEditorParamSection({ title, expanded, onToggle, children }: {
  title: string; expanded: boolean; onToggle(): void; children: ReactNode;
}): JSX.Element {
  const id = useId();
  return (
    <section className={`step-editor-param-section${expanded ? " is-expanded" : ""}`} aria-labelledby={`${id}-header`}>
      <button id={`${id}-header`} type="button" className="step-editor-param-section__header"
        aria-expanded={expanded} aria-controls={expanded ? `${id}-body` : undefined} onClick={onToggle}>
        <span className="step-editor-param-section__chevron" aria-hidden="true" />
        <span>{title}</span>
      </button>
      {expanded ? <div id={`${id}-body`} className="step-editor-param-section__body">{children}</div> : null}
    </section>
  );
}
