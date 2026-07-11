import Link from "next/link";
import { DayNightBackground } from "@/components/DayNightBackground";

const PLACEHOLDER_SCENES = ["Scene 1", "Scene 2"];

export default function Home() {
  return (
    <main className="relative flex-1 flex flex-col items-center justify-center gap-12 px-6 pb-20 sm:pb-32">
      <DayNightBackground />

      <h1 className="relative text-8xl sm:text-9xl font-bold tracking-tight text-white/90 drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)]">
        tiny tracer
      </h1>

      <div className="relative grid grid-cols-1 sm:grid-cols-3 gap-6 w-full max-w-4xl">
        {PLACEHOLDER_SCENES.map((name) => (
          <div
            key={name}
            className="aspect-[4/3] rounded-2xl flex items-center justify-center text-base text-white/30 border border-white/10 bg-[#15151d]"
          >
            {name}
          </div>
        ))}

        <Link
          href="/sandbox"
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
