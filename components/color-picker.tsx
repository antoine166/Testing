"use client";

const PRESET_COLORS = [
  { hex: "#ef4444", name: "Red" },
  { hex: "#f97316", name: "Orange" },
  { hex: "#eab308", name: "Yellow" },
  { hex: "#22c55e", name: "Green" },
  { hex: "#10b981", name: "Emerald" },
  { hex: "#06b6d4", name: "Cyan" },
  { hex: "#6366f1", name: "Indigo" },
  { hex: "#a855f7", name: "Purple" },
  { hex: "#ec4899", name: "Pink" },
];

export default function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1.5 sm:gap-1">
        {PRESET_COLORS.map(({ hex, name }) => (
          <button
            key={hex}
            type="button"
            onClick={() => onChange(hex)}
            aria-label={`Pick color ${name}`}
            title={name}
            className={`h-7 w-7 shrink-0 rounded-full sm:h-6 sm:w-6 ${
              value.toLowerCase() === hex
                ? "ring-2 ring-zinc-950 ring-offset-1 dark:ring-zinc-50"
                : ""
            }`}
            style={{ backgroundColor: hex }}
          />
        ))}
      </div>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Custom color"
        title="Custom color"
        className="h-7 w-8 rounded-md border border-zinc-300 dark:border-zinc-700"
      />
    </div>
  );
}
