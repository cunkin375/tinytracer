"use client";

import dynamic from "next/dynamic";

/**
 * Dynamically import the Three.js sandbox with SSR disabled.
 * Three.js relies on browser APIs (window, document, HTMLCanvasElement)
 * that are unavailable during server-side rendering.
 *
 * Per the Next.js 16 docs, `ssr: false` must be used from a Client Component
 * context, but `next/dynamic` itself can be called at the module level of a
 * Server Component — the ssr:false flag is evaluated at bundle time.
 * However, the safer pattern per the docs (line 66-67 of lazy-loading.md)
 * is to use it inside a Client Component wrapper. We wrap the dynamic import
 * in a thin client-boundary page to be safe.
 */

const PathTracerSandbox = dynamic(
  () => import("@/components/PathTracerSandbox"),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 flex items-center justify-center bg-[#0a0a0f]">
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-10 h-10 rounded-full"
            style={{
              border: "2px solid rgba(116, 195, 17, 0.2)",
              borderTopColor: "#74c311",
              animation: "spin 1s linear infinite",
            }}
          />
          <p className="text-sm text-white/40 tracking-wide">
            Loading Sandbox…
          </p>
        </div>
      </div>
    ),
  }
);

export default function Home() {
  return (
    <main className="flex-1 flex flex-col w-full h-full">
      <PathTracerSandbox />
    </main>
  );
}
