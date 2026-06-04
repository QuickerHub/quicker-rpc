import { lazy, Suspense, type JSX } from "react";

export type ExpressionEditorProps = {
  value: string;
  onChange: (nextValue: string) => void;
  disabled?: boolean;
  placeholder?: string;
  multiline?: boolean;
  /** Cap auto-grown multiline height (px). Default matches MonacoExpressionEditor. */
  maxMultilineHeight?: number;
  className?: string;
};

const MonacoExpressionEditor = lazy(async () => {
  const mod = await import("./MonacoExpressionEditor");
  return { default: mod.MonacoExpressionEditor };
});

let monacoExpressionEditorPreload: Promise<void> | null = null;

/** Warm Monaco chunk before step popup fields mount to avoid inline height jumps. */
export function preloadMonacoExpressionEditor(): Promise<void> {
  if (!monacoExpressionEditorPreload) {
    monacoExpressionEditorPreload = import("./MonacoExpressionEditor").then(() => undefined);
  }
  return monacoExpressionEditorPreload;
}

function ExpressionEditorFallback({ multiline, className }: Pick<ExpressionEditorProps, "multiline" | "className">): JSX.Element {
  const rootClass = [
    "expression-editor",
    multiline ? "expression-editor--multiline" : "expression-editor--inline",
    "expression-editor--monaco",
    "expression-editor--loading",
    className ?? ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={rootClass}
      style={multiline ? { minHeight: 40 } : { height: 22, minHeight: 22 }}
      aria-hidden="true"
    />
  );
}

/**
 * Monaco-based editor for step expression / VarOrValue fields (C# + Quicker `{var}` placeholders).
 */
export function ExpressionEditor({
  value,
  onChange,
  disabled = false,
  placeholder,
  multiline = false,
  maxMultilineHeight,
  className
}: ExpressionEditorProps): JSX.Element {
  return (
    <Suspense fallback={<ExpressionEditorFallback multiline={multiline} className={className} />}>
      <MonacoExpressionEditor
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder={placeholder}
        multiline={multiline}
        maxMultilineHeight={maxMultilineHeight}
        className={className}
      />
    </Suspense>
  );
}
