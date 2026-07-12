import { BrandButton } from "@/components/BrandButton";

/**
 * Static header bar — brand, plus mobile-only toggle buttons for the scene
 * controls / run panel, which collapse into off-canvas drawers below the
 * `sm` breakpoint (see index.tsx).
 */
export function TopBar({
  onToggleLeft,
  onToggleRight,
}: {
  onToggleLeft: () => void;
  onToggleRight: () => void;
}) {
  return (
    <header
      className="flex items-center gap-3 px-4 sm:px-5 py-3 border-b border-white/10"
      style={{ background: "rgba(18, 18, 26, 0.9)" }}
    >
      <button
        onClick={onToggleLeft}
        aria-label="Toggle scene controls"
        className="sm:hidden flex items-center justify-center w-9 h-9 rounded-lg text-white/70 hover:text-white hover:bg-white/5 transition-colors"
      >
        <MenuIcon />
      </button>

      <BrandButton label="forest" />

      <div className="flex-1" />

      <button
        onClick={onToggleRight}
        aria-label="Toggle run panel"
        className="sm:hidden flex items-center justify-center w-9 h-9 rounded-lg text-white/70 hover:text-white hover:bg-white/5 transition-colors"
      >
        <BoltIcon />
      </button>
    </header>
  );
}

function MenuIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
    </svg>
  );
}
