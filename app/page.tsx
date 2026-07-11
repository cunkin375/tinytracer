import Link from "next/link";

const PLACEHOLDER_SCENES = ["Scene 1", "Scene 2", "Scene 3"];

export default function Home() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-12 px-6">
      <h1 className="text-6xl font-bold tracking-tight text-white/90">
        tiny tracer
      </h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full max-w-2xl">
        {PLACEHOLDER_SCENES.map((name) => (
          <div
            key={name}
            className="aspect-video rounded-xl flex items-center justify-center text-sm text-white/30 border border-white/10 bg-white/[0.03]"
          >
            {name}
          </div>
        ))}

        <Link
          href="/sandbox"
          className="aspect-video rounded-xl flex items-center justify-center text-sm font-medium text-white transition-colors"
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
