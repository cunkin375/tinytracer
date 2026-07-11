import Link from "next/link";

/**
 * "tiny tracer" wordmark, styled like the rest of the app's floating panels
 * (dark glass, green-tinted border) so it reads as a button rather than bare
 * text. Always links back to the landing page. Used in the top-left corner
 * of every page — pass `label` for a page-specific subtitle (e.g. the
 * current scene's name).
 */
export function BrandButton({ label }: { label?: string }) {
  return (
    <Link
      href="/"
      className="pointer-events-auto flex items-baseline gap-2 rounded-xl px-4 py-2 transition-colors hover:bg-white/5"
      style={{
        background: "rgba(18, 18, 26, 0.85)",
        backdropFilter: "blur(16px)",
        border: "1px solid rgba(35, 83, 56, 0.45)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      }}
    >
      <span className="text-lg font-bold tracking-tight text-white/90">
        tiny tracer
      </span>
      {label && (
        <span className="text-[10px] text-white/40 tracking-wide uppercase">
          {label}
        </span>
      )}
    </Link>
  );
}
