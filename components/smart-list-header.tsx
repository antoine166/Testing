// iOS large-title style, graphite: bare glyph + big bold title, no colored
// chip (color belongs to data — domain dots — not chrome). `color` is still
// accepted so call sites don't churn; it's simply unused in this look.
export default function SmartListHeader({
  icon,
  title,
  count,
}: {
  icon: string;
  color?: string;
  title: string;
  count?: number;
}) {
  return (
    <div className="mb-6 flex items-center gap-2.5">
      <span className="text-2xl leading-none">{icon}</span>
      <h1 className="text-3xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
        {title}
        {count !== undefined && count > 0 && (
          <span className="ml-2.5 text-xl font-normal text-zinc-400">{count}</span>
        )}
      </h1>
    </div>
  );
}
