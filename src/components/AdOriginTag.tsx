// Label kecil "📣 From ad: <judul iklan>" untuk lead yang datang dari iklan
// Meta (Click-to-WhatsApp). Tidak tampil apa-apa kalau lead bukan dari
// iklan. Judul iklan yang kosong ditulis "Meta ad".
export default function AdOriginTag({
  adSourceId,
  headlines,
  className = "",
}: {
  adSourceId: string | null;
  headlines: Map<string, string>;
  className?: string;
}) {
  if (!adSourceId) return null;
  const headline = headlines.get(adSourceId) || "Meta ad";
  return (
    <span
      title={`This lead came from the Meta ad: ${headline}`}
      className={`inline-flex max-w-full items-center gap-1 rounded-md bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700 ${className}`}
    >
      <span aria-hidden="true">📣</span>
      <span className="truncate">From ad: {headline}</span>
    </span>
  );
}
