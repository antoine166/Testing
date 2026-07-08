"use client";

const PRESET_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#10b981", // emerald
  "#06b6d4", // cyan
  "#6366f1", // indigo
  "#a855f7", // purple
  "#ec4899", // pink
];

export default function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1">
        {PRESET_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => onChange(color)}
            aria-label={`Pick color ${color}`}
            className={`h-6 w-6 rounded-full ${
              value.toLowerCase() === color
                ? "ring-2 ring-zinc-950 ring-offset-1 dark:ring-zinc-50"
                : ""
            }`}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Custom color"
        className="h-7 w-8 rounded-md border border-zinc-300 dark:border-zinc-700"
      />
    </div>
  );
}
