"use client";

import { formatFaSearchPlainText } from "@/lib/fa-search";

type FaSearchPlainTextProps = {
  names: string[];
  emptyMessage?: string;
};

export function FaSearchPlainText({
  names,
  emptyMessage = "没有匹配的图标",
}: FaSearchPlainTextProps) {
  if (names.length === 0) {
    return <p className="fa-search-empty">{emptyMessage}</p>;
  }

  return (
    <pre className="fa-search-plain tool-json tool-json--inline" tabIndex={0}>
      {formatFaSearchPlainText(names)}
    </pre>
  );
}
