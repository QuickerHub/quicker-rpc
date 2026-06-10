import type { PinnedAction } from "@/lib/action-context";
import type { FaIconGeometry } from "@/lib/fa-icon";
import { isFaIconSpec, isHttpIconUrl } from "@/lib/fa-icon";
import {
  ensureFaIconsResolved,
  getFaIconFromCache,
} from "@/lib/fa-icon-cache";
import { resolveMentionItemIcon } from "@/lib/action-mention-items";
import {
  COMPOSER_SUBPROGRAM_TAG_ICON_CLASS,
  DEFAULT_GLOBAL_SUBPROGRAM_FA_ICON,
} from "@/lib/global-subprogram-icon";

const COMPOSER_ACTION_FA_ICON_CLASS =
  "composer-prompt-tag__icon composer-prompt-tag__icon--fa";

const COMPOSER_PLACEHOLDER_ICON_CLASS =
  "composer-prompt-tag__icon composer-prompt-tag__icon--placeholder";

/** Icon spec for an inline action/subprogram tag chip. */
export function resolveComposerTagIconSpec(action: PinnedAction): string | undefined {
  return resolveMentionItemIcon(action);
}

export function isComposerSubprogramTag(action: PinnedAction): boolean {
  return action.kind === "subprogram";
}

function composerFaIconClassName(isSubprogram: boolean): string {
  return isSubprogram ? COMPOSER_SUBPROGRAM_TAG_ICON_CLASS : COMPOSER_ACTION_FA_ICON_CLASS;
}

function createFaSvgIcon(
  geometry: FaIconGeometry,
  className: string,
): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", className);
  svg.setAttribute("viewBox", `0 0 ${geometry.width} ${geometry.height}`);
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("fill", geometry.color ?? "currentColor");
  path.setAttribute("d", geometry.path);
  svg.append(path);
  return svg;
}

/** Build the leading icon node for a composer tag chip (DOM). */
export function createComposerTagIconElement(action: PinnedAction): Element {
  const isSubprogram = isComposerSubprogramTag(action);
  const spec = resolveComposerTagIconSpec(action);

  if (spec && isHttpIconUrl(spec)) {
    const img = document.createElement("img");
    img.src = spec;
    img.alt = "";
    img.className = "composer-prompt-tag__icon composer-prompt-tag__icon--img";
    img.draggable = false;
    return img;
  }

  const faSpec = spec && isFaIconSpec(spec) ? spec : undefined;
  if (faSpec) {
    const geometry = getFaIconFromCache(faSpec);
    if (geometry) {
      return createFaSvgIcon(geometry, composerFaIconClassName(isSubprogram));
    }
    ensureFaIconsResolved([faSpec]);
  }

  const placeholder = document.createElement("span");
  placeholder.className = isSubprogram
    ? `${COMPOSER_SUBPROGRAM_TAG_ICON_CLASS} ${COMPOSER_PLACEHOLDER_ICON_CLASS}`
    : COMPOSER_PLACEHOLDER_ICON_CLASS;
  placeholder.setAttribute("aria-hidden", "true");
  if (faSpec) {
    placeholder.setAttribute("data-fa-spec", faSpec);
  }
  return placeholder;
}

/** Upgrade FA placeholders after async icon geometry resolves. */
export function hydrateComposerTagIcons(root: HTMLElement): void {
  const placeholders = root.querySelectorAll<HTMLElement>(
    ".composer-prompt-tag__icon--placeholder[data-fa-spec]",
  );
  for (const el of placeholders) {
    const faSpec = el.getAttribute("data-fa-spec")?.trim();
    if (!faSpec || !isFaIconSpec(faSpec)) continue;
    const geometry = getFaIconFromCache(faSpec);
    if (!geometry) {
      ensureFaIconsResolved([faSpec]);
      continue;
    }
    const isSubprogram = el.closest(".composer-prompt-tag--subprogram") !== null;
    el.replaceWith(createFaSvgIcon(geometry, composerFaIconClassName(isSubprogram)));
  }
}

/** Preload default subprogram glyph for composer chips. */
export function preloadComposerTagIcons(): void {
  ensureFaIconsResolved([DEFAULT_GLOBAL_SUBPROGRAM_FA_ICON]);
}
