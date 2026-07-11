import Link from "next/link";
import { DayNightBackground } from "@/components/DayNightBackground";

export default function Home() {
  return (
    <main className="relative flex-1 flex flex-col items-center justify-center gap-12 px-6 pb-20 sm:pb-32">
      <DayNightBackground />

      <h1 className="relative text-8xl sm:text-9xl font-bold tracking-tight text-white/90 drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)]">
        tiny tracer
      </h1>

      <div className="relative grid grid-cols-1 sm:grid-cols-3 gap-6 w-full max-w-4xl">
        {/* Forest — the scene we already have. */}
        <Link
          href="/sandbox"
          className="aspect-[4/3] rounded-2xl flex items-center justify-center text-base text-white/30 border border-white/10 bg-[#15151d] transition-colors hover:border-white/25 hover:text-white/50"
        >
          Forest
        </Link>

        {/* City — not built yet, inert. */}
        <div className="relative aspect-[4/3] rounded-2xl overflow-hidden flex items-center justify-center text-base text-white/30 border border-white/10 bg-[#15151d]">
          City
          <div className="absolute top-4 -right-10 rotate-45 bg-amber-400 text-black text-[10px] font-bold tracking-wide px-10 py-1 shadow-md">
            COMING SOON
          </div>
        </div>

        <Link
          href="/shape-editor.html"
          className="aspect-[4/3] rounded-2xl flex items-center justify-center text-base font-medium text-white transition-transform hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #74c311 0%, #235338 100%)",
          }}
        >
          + Create Your Own
        </Link>
      </div>
    </main>
  );
}
