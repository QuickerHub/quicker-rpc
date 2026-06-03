import { lazy, Suspense, type JSX } from "react";

export type ExpressionEditorProps = {
  value: string;
  onChange: (nextValue: string) => void;
  disabled?: boolean;
  placeholder?: string;
  multiline?: boolean;
  className?: string;
};

const MonacoExpressionEditor = lazy(async () => {
  const mod = await import("./MonacoExpressionEditor");
  return { default: mod.MonacoExpressionEditor };
});

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

  return <div className={rootClass} aria-hidden="true" />;
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
        className={className}
      />
    </Suspense>
  );
}
