import type { LlmBuiltinSponsor } from "@/lib/llm-builtin-sponsors";

type BuiltinModelSponsorLineProps = {
  sponsor: LlmBuiltinSponsor | undefined;
  /** Inline row: shorter copy without leading "模型". */
  compact?: boolean;
};

export function BuiltinModelSponsorLine({
  sponsor,
  compact = false,
}: BuiltinModelSponsorLineProps) {
  if (!sponsor?.name || !sponsor.url) return null;

  return (
    <span className="llm-config-list-sponsor">
      {compact ? "由 " : "模型由 "}
      <a
        href={sponsor.url}
        target="_blank"
        rel="noopener noreferrer"
        className="llm-config-list-sponsor-link"
      >
        {sponsor.name}
      </a>
      {" "}赞助
    </span>
  );
}
