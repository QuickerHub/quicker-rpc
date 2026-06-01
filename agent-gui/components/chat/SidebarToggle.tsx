"use client";

/** Layout icon: outer frame + filled left sidebar (matches common IDE sidebar toggle). */
function IconSidebarLayout() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect
        x="2.25"
        y="2.75"
        width="11.5"
        height="10.5"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <rect
        x="3.5"
        y="4"
        width="3.5"
        height="8"
        rx="0.65"
        fill="currentColor"
      />
    </svg>
  );
}

type SidebarToggleProps = {
  sidebarOpen: boolean;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
};

export function SidebarToggle({
  sidebarOpen,
  onClick,
  className = "",
  disabled = false,
}: SidebarToggleProps) {
  const label = sidebarOpen ? "收起侧栏" : "展开侧栏";
  return (
    <button
      type="button"
      className={`ws-sidebar-toggle${className ? ` ${className}` : ""}`}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-expanded={sidebarOpen}
    >
      <IconSidebarLayout />
    </button>
  );
}
