import type { ReactNode } from "react";
import { memo } from "react";
import { Icon } from "@iconify/react";
import { getBundledIconifyIcon } from "./actionDesignerIconify";
import { IconEmptyPlaceholder, iconSlotFrameStyle } from "./FaVectorSvg";

export type IconifyIconSlotProps = {
  /** Full Iconify id, e.g. `mdi:shield-lock`. */
  iconId: string;
  size?: number;
  className?: string;
  title?: string;
  fallback?: ReactNode | null;
};

/**
 * Renders a bundled Iconify icon by id (no network). Unknown ids show fallback.
 */
export const IconifyIconSlot = memo(function IconifyIconSlot({
  iconId,
  size = 14,
  className,
  title,
  fallback = null
}: IconifyIconSlotProps): JSX.Element {
  const data = getBundledIconifyIcon(iconId);
  if (!data) {
    if (fallback === null || fallback === undefined) {
      return <IconEmptyPlaceholder size={size} className={className} title={title} />;
    }
    return (
      <span
        className={className}
        title={title}
        style={{
          ...iconSlotFrameStyle(size),
          fontSize: Math.max(10, size - 2)
        }}
      >
        {fallback}
      </span>
    );
  }

  return (
    <span className={className} title={title} style={iconSlotFrameStyle(size)}>
      <Icon
        icon={data}
        width={size}
        height={size}
        aria-hidden
        style={{ display: "block", color: "currentColor" }}
      />
    </span>
  );
});
