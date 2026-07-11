import { MAX_TREE_COUNT } from "../constants";

/**
 * The main app is a locked-down viewer (see useThreeScene.ts): terrain,
 * trees, and the solar panel aren't selectable/movable there, and there's no
 * way to add/sculpt shapes directly. This panel is the one piece of real
 * scene control the main app still exposes — tree density, adding the one
 * draggable object (Car), and a way back to the shape editor for anything
 * bigger.
 */
export function ScenePanel({
  treeCount,
  onTreeCountChange,
  onAddCar,
}: {
  treeCount: number;
  onTreeCountChange: (count: number) => void;
  onAddCar: () => void;
}) {
  return (
    <div className="absolute right-4 top-20 z-10 pointer-events-auto">
      <div
        className="flex flex-col gap-3 rounded-2xl p-4 w-56"
        style={{
          background: "rgba(18, 18, 26, 0.85)",
          backdropFilter: "blur(16px)",
          border: "1px solid rgba(35, 83, 56, 0.45)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}
      >
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="tree-count-slider"
              className="text-[11px] text-white/50"
            >
              Trees
            </label>
            <span className="text-[11px] text-white/70 font-medium">
              {treeCount}
            </span>
          </div>
          <input
            id="tree-count-slider"
            type="range"
            min={0}
            max={MAX_TREE_COUNT}
            step={1}
            value={treeCount}
            onChange={(e) => onTreeCountChange(Number(e.target.value))}
            className="w-full accent-[#74c311]"
          />
        </div>

        <div>
          <label
            htmlFor="add-object-select"
            className="text-[11px] text-white/50 block mb-1.5"
          >
            Add object
          </label>
          <select
            id="add-object-select"
            value=""
            onChange={(e) => {
              if (e.target.value === "Car") onAddCar();
              e.currentTarget.value = "";
            }}
            className="w-full text-[12px] rounded-lg px-2 py-1.5 cursor-pointer"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "white",
            }}
          >
            <option value="" disabled>
              Add…
            </option>
            <option value="Car">Car</option>
          </select>
        </div>

        <a
          href="/shape-editor.html"
          className="text-center text-[12px] font-medium rounded-lg px-3 py-2 transition-colors"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.8)",
          }}
        >
          Edit in Editor →
        </a>
      </div>
    </div>
  );
}
