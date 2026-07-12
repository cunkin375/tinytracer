import { BrandButton } from "@/components/BrandButton";

/** Static header bar — brand + a one-line description of the scene. */
export function TopBar() {
  return (
    <header
      className="flex items-center gap-4 px-5 py-3 border-b border-white/10"
      style={{ background: "rgba(18, 18, 26, 0.9)" }}
    >
      <BrandButton label="forest" />
      <p className="text-xs text-white/40">
        
      </p>
    </header>
  );
}
