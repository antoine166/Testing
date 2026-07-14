export default function SmartListHeader({
  icon,
  color,
  title,
  count,
}: {
  icon: string;
  color: string;
  title: string;
  count?: number;
}) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base font-bold text-white"
        style={{ backgroundColor: color }}
      >
        {icon}
      </span>
      <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
        {title}
        {count !== undefined && count > 0 && (
          <span className="ml-2 text-lg font-normal text-zinc-400">{count}</span>
        )}
      </h1>
    </div>
  );
}
