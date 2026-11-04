import type { ReactNode } from "react";

export type StatTone = "default" | "accent" | "success" | "warning" | "ai";

const TONE_CLASS: Record<StatTone, string> = {
  default: "text-foreground",
  accent: "text-accent",
  success: "text-[var(--color-success)]",
  warning: "text-[var(--color-warning)]",
  ai: "text-[var(--color-ai)]",
};

// Satu kotak angka ringkasan (mis. "Total leads 120"). `hint` = keterangan
// kecil di bawah angka, mis. perbandingan dengan minggu lalu.
export default function StatTile({
  label,
  value,
  tone = "default",
  hint,
}: {
  label: string;
  value: ReactNode;
  tone?: StatTone;
  hint?: ReactNode;
}) {
  return (
    <div className="card p-4 flex flex-col gap-1 min-w-0">
      <p className="text-xs font-medium text-[var(--color-muted)]">{label}</p>
      <p className={`font-data text-2xl font-semibold truncate ${TONE_CLASS[tone]}`}>
        {value}
      </p>
      {hint && <div className="text-xs text-[var(--color-muted)]">{hint}</div>}
    </div>
  );
}

// Keterangan perubahan dibanding periode sebelumnya: "▲ 3 vs last week"
// (hijau kalau naik, merah kalau turun, abu-abu kalau sama).
export function ChangeHint({ current, previous, label }: {
  current: number;
  previous: number;
  label: string;
}) {
  const diff = current - previous;
  if (diff === 0) return <span>Same as {label}</span>;
  const up = diff > 0;
  return (
    <span>
      <span className={up ? "text-[var(--color-success)] font-medium" : "text-[var(--color-danger)] font-medium"}>
        {up ? "▲" : "▼"} {Math.abs(diff)}
      </span>{" "}
      vs {label}
    </span>
  );
}
