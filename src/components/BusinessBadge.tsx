import { BUSINESS_TONE_CLASSES, businessTone } from "@/lib/businessStyle";

// Label berwarna nama business (merah = TransTRACK, biru = Academy) —
// dipakai di Board, tabel Prospects, dan halaman detail lead.
// Kalau lead belum punya business, tampilkan label abu-abu "No business"
// supaya kelihatan masih perlu diisi.
export default function BusinessBadge({
  name,
  size = "sm",
}: {
  name: string | null | undefined;
  size?: "sm" | "md";
}) {
  const sizeClass =
    size === "md" ? "text-sm px-3 py-1" : "text-[11px] px-2 py-0.5";

  if (!name) {
    return (
      <span
        className={`inline-block rounded-full border border-dashed border-[var(--color-border)] text-[var(--color-muted)] whitespace-nowrap ${sizeClass}`}
      >
        No business
      </span>
    );
  }

  const tone = BUSINESS_TONE_CLASSES[businessTone(name)];
  return (
    <span
      className={`inline-block rounded-full border font-semibold uppercase tracking-wide whitespace-nowrap ${tone.solid} ${sizeClass}`}
    >
      {name}
    </span>
  );
}
