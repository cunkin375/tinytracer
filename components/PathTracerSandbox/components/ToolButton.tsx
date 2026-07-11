export function ToolButton({
  id,
  tooltip,
  active,
  onClick,
  children,
}: {
  id: string;
  tooltip: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      id={id}
      title={tooltip}
      onClick={onClick}
      className="relative w-10 h-10 rounded-xl flex items-center justify-center
        transition-all duration-200 cursor-pointer group"
      style={{
        background: active ? "rgba(116, 195, 17, 0.18)" : "transparent",
        color: active ? "#74c311" : "rgba(255,255,255,0.5)",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = "rgba(255,255,255,0.06)";
          e.currentTarget.style.color = "rgba(255,255,255,0.8)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "rgba(255,255,255,0.5)";
        }
      }}
    >
      {children}
    </button>
  );
}
