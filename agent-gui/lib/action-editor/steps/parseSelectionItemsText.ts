import { StepRunnerParamSelectionItem } from "@/lib/action-editor/types/action_query";

/** Split multi-line Quicker option text (mirrors CommonExtensions.SplitToList default). */
function splitToLines(text: string): string[] {
  if (!text) {
    return [];
  }
  return text.split(/\r\n|\n|\r/);
}

/**
 * Parse title segment `[icon]title(tooltip)` (mirrors CommonOperationItem.ExtractIconAndTitle).
 */
function extractIconAndTitle(titleText: string): { title: string; tooltip: string } {
  let textWithoutIcon = titleText;

  if (titleText.startsWith("[")) {
    const simplePrefixes = ["[fa:", "[url:"];
    if (simplePrefixes.some((p) => titleText.startsWith(p))) {
      const end = titleText.indexOf("]", 1);
      if (end > 0) {
        textWithoutIcon = titleText.slice(end + 1);
      }
    } else {
      const nestedPrefixes = ["[icon:", "[previmg:", "[shellicon:", "[action:", "[text:"];
      if (nestedPrefixes.some((p) => titleText.startsWith(p))) {
        let depth = 1;
        for (let i = 1; i < titleText.length; i++) {
          if (titleText[i] === "[") {
            depth++;
          } else if (titleText[i] === "]") {
            depth--;
            if (depth === 0) {
              textWithoutIcon = titleText.slice(i + 1);
              break;
            }
          }
        }
      }
    }
  }

  const parsed = parseTitleAndTooltip(textWithoutIcon);
  let tooltip = parsed.tooltip;
  if (tooltip === "") {
    tooltip = "";
  } else if (tooltip.includes("\\r\\n")) {
    tooltip = tooltip.replace(/\\r\\n/g, "\r\n");
  }
  return { title: parsed.title, tooltip };
}

/** Mirrors CommonOperationItem.ParseTitleAndTooltip. */
function parseTitleAndTooltip(text: string): { title: string; tooltip: string } {
  if (!text || !text.endsWith(")")) {
    return { title: text, tooltip: "" };
  }
  if (text.toLowerCase().endsWith("s (x86)")) {
    return { title: text, tooltip: "" };
  }
  if (text.length > 4 && text[text.length - 4] === "(" && text[text.length - 3] === "_") {
    return { title: text, tooltip: "" };
  }

  let layer = 1;
  for (let i = text.length - 2; i >= 0; i--) {
    if (text[i] === "(") {
      layer--;
      if (layer === 0) {
        const tooltip = text.slice(i + 1, text.length - 1);
        const title = i === 0 ? "" : text.slice(0, i);
        return { title, tooltip };
      }
    } else if (text[i] === ")") {
      layer++;
    }
  }
  return { title: text, tooltip: "" };
}

function parseOperationItem(
  line: string,
  splitter: string
): StepRunnerParamSelectionItem | null {
  if (!line) {
    return StepRunnerParamSelectionItem.fromPartial({ value: line, name: line, description: "" });
  }

  if (line.includes(splitter)) {
    const idx = line.indexOf(splitter);
    const display = line.slice(0, idx);
    const key = line.slice(idx + splitter.length);
    const info = extractIconAndTitle(display);
    return StepRunnerParamSelectionItem.fromPartial({
      value: key,
      name: info.title,
      description: info.tooltip
    });
  }

  const info = extractIconAndTitle(line);
  return StepRunnerParamSelectionItem.fromPartial({
    value: line,
    name: info.title,
    description: info.tooltip
  });
}

/**
 * Parse ActionVariable.InputParamInfo.SelectionItems text into step runner enum options.
 * Mirrors AppHelper.StringToOperationItems(items, extraIconAndTooltip: true).
 */
export function parseSelectionItemsText(items: string): StepRunnerParamSelectionItem[] {
  const trimmed = (items ?? "").trim();
  if (!trimmed) {
    return [];
  }

  let splitter = "|";
  const result: StepRunnerParamSelectionItem[] = [];

  for (const option of splitToLines(trimmed)) {
    if (!option) {
      continue;
    }
    if (option.startsWith("////")) {
      continue;
    }
    if (result.length === 0 && option.startsWith("|=")) {
      splitter = option.slice(2);
      if (!splitter) {
        continue;
      }
      continue;
    }

    const item = parseOperationItem(option, splitter);
    if (item) {
      result.push(item);
    }
  }

  return result;
}
