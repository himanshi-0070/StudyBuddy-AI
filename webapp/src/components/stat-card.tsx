import { type ReactNode } from "react";

export function StatCard({
  label,
  value,
  hint,
  accent = "mint",
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: "mint" | "violet" | "amber" | "coral";
  icon?: ReactNode;
}) {
  const accentMap = {
    mint: "text-mint",
    violet: "text-violet",
    amber: "text-amber",
    coral: "text-coral",
  };
  return (
    <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-surface p-6">
      <div className="flex items-start justify-between">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
        {icon && <span className={accentMap[accent]}>{icon}</span>}
      </div>
      <p className="mt-4 font-display text-4xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-2 text-sm text-muted-foreground">{hint}</p>}
      <div
        className={`pointer-events-none absolute -bottom-12 -right-12 h-32 w-32 rounded-full blur-3xl opacity-40 ${
          accent === "mint"
            ? "bg-mint"
            : accent === "violet"
              ? "bg-violet"
              : accent === "amber"
                ? "bg-amber"
                : "bg-coral"
        }`}
      />
    </div>
  );
}
