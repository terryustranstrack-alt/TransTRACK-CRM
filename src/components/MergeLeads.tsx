"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useProfiles, profileLabel } from "@/lib/useProfiles";
import { useCurrentProfile } from "@/lib/useCurrentProfile";
import { mergeLeads, type MergeChoices, type MergeField } from "@/app/leads/actions";
import { leadStatusLabel, type Lead, type Profile } from "@/lib/types";

const supabase = createClient();

// Field yang ikut digabung, beserta label tampilannya. Urutan di sini =
// urutan baris di layar merge.
const FIELDS: { key: MergeField; label: string }[] = [
  { key: "nama", label: "Name" },
  { key: "kontak", label: "Contact" },
  { key: "email", label: "Email" },
  { key: "sumber", label: "Source" },
  { key: "perusahaan", label: "Company" },
  { key: "jabatan", label: "Job title" },
  { key: "kota", label: "City" },
  { key: "produk", label: "Product/need" },
  { key: "estimasi_nilai", label: "Estimated value" },
  { key: "catatan", label: "Notes" },
  { key: "next_step", label: "Next step" },
  { key: "next_step_due", label: "Next step due" },
  { key: "assigned_to", label: "Assigned to" },
];

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

// Teks yang ditampilkan untuk satu field sebuah lead (mengubah id assignee
// jadi nama, angka jadi format ribuan, dll.).
function displayValue(
  key: MergeField,
  lead: Lead,
  profiles: Profile[],
): string {
  const raw = lead[key];
  if (isEmpty(raw)) return "—";
  if (key === "assigned_to") {
    const owner = profiles.find((p) => p.id === raw);
    return owner ? profileLabel(owner) : "—";
  }
  if (key === "estimasi_nilai") return Number(raw).toLocaleString("id-ID");
  if (key === "next_step_due") return String(raw).slice(0, 10);
  return String(raw);
}

// Layar gabungkan dua lead. Lead di URL = "primary" (yang dipertahankan);
// lead kedua = "secondary" (yang dihapus setelah datanya dipindah).
export default function MergeLeads({
  primaryId,
  initialSecondaryId,
}: {
  primaryId: string;
  initialSecondaryId: string | null;
}) {
  const router = useRouter();
  const profiles = useProfiles();
  const { profile: currentProfile } = useCurrentProfile();
  const isAdmin = !!currentProfile?.is_admin;

  const [primary, setPrimary] = useState<Lead | null>(null);
  const [secondary, setSecondary] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Lead[]>([]);
  // Pilihan yang di-override manual lewat radio. Nilai efektif = default
  // (isi otomatis field kosong) ditimpa override ini.
  const [overrides, setOverrides] = useState<MergeChoices>({});
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: primaryData, error: primaryError } = await supabase
        .from("leads")
        .select("*")
        .eq("id", primaryId)
        .single();
      if (primaryError) {
        setError(primaryError.message);
        setLoading(false);
        return;
      }
      setPrimary(primaryData as Lead);

      if (initialSecondaryId && initialSecondaryId !== primaryId) {
        const { data: secondaryData } = await supabase
          .from("leads")
          .select("*")
          .eq("id", initialSecondaryId)
          .single();
        if (secondaryData) setSecondary(secondaryData as Lead);
      }
      setLoading(false);
    }
    load();
  }, [primaryId, initialSecondaryId]);

  // Cari kandidat lead kedua berdasarkan nama / nomor (kecuali lead primary).
  useEffect(() => {
    // Buang karakter yang punya arti khusus di filter PostgREST (koma & tanda
    // kurung memisahkan/mengelompokkan kondisi di .or()).
    const keyword = search.trim().replace(/[,()]/g, " ");
    let cancelled = false;
    (async () => {
      if (!keyword) {
        if (!cancelled) setSearchResults([]);
        return;
      }
      const { data } = await supabase
        .from("leads")
        .select("*")
        .or(`nama.ilike.%${keyword}%,kontak.ilike.%${keyword}%`)
        .neq("id", primaryId)
        .limit(8);
      if (!cancelled) setSearchResults((data as Lead[]) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [search, primaryId]);

  // Pilihan efektif tiap field: default (isi otomatis field kosong dari
  // secondary) ditimpa override manual dari radio.
  const choices = useMemo<MergeChoices>(() => {
    if (!primary || !secondary) return {};
    const next: MergeChoices = {};
    for (const { key } of FIELDS) {
      next[key] =
        overrides[key] ??
        (isEmpty(primary[key]) && !isEmpty(secondary[key])
          ? "secondary"
          : "primary");
    }
    return next;
  }, [primary, secondary, overrides]);

  async function handleMerge() {
    if (!primary || !secondary) return;
    setMerging(true);
    setError(null);
    const result = await mergeLeads(primary.id, secondary.id, choices);
    if (result?.error) {
      setError(result.error);
      setMerging(false);
      return;
    }
    router.push(`/leads/${primary.id}`);
  }

  if (loading) {
    return <p className="p-8 text-sm text-[var(--color-muted)]">Loading…</p>;
  }
  if (!primary) {
    return (
      <p className="p-8 text-sm text-[var(--color-danger)]">
        {error ?? "Lead not found."}
      </p>
    );
  }
  if (!isAdmin) {
    return (
      <main className="p-4 sm:p-8 max-w-lg flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Merge leads</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Only admins can merge leads. Ask an admin to combine these records.
        </p>
        <Link
          href={`/leads/${primary.id}`}
          className="text-sm text-accent hover:underline self-start"
        >
          ← Back to lead
        </Link>
      </main>
    );
  }

  return (
    <main className="p-4 sm:p-8 max-w-3xl flex flex-col gap-6">
      <Link
        href={`/leads/${primary.id}`}
        className="text-sm text-[var(--color-muted)] hover:underline self-start"
      >
        ← Back to lead
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Merge leads</h1>

      {!secondary ? (
        <div className="flex flex-col gap-2 max-w-md">
          <p className="text-sm text-[var(--color-muted)]">
            Keeping <span className="font-medium">{primary.nama}</span>. Pick the
            duplicate to merge into it:
          </p>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or number…"
            className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm"
          />
          <ul className="flex flex-col gap-1">
            {searchResults.map((lead) => (
              <li key={lead.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSecondary(lead);
                    setOverrides({});
                    setSearch("");
                  }}
                  className="text-left w-full px-2 py-1 rounded-lg hover:bg-[var(--color-muted-bg)] text-sm"
                >
                  {lead.nama} · {lead.kontak}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <p className="text-sm">
            Keeping <span className="font-medium">{primary.nama}</span>, merging
            in <span className="font-medium">{secondary.nama}</span>. For each
            field, choose which value to keep.
          </p>

          <div className="overflow-x-auto border border-[var(--color-border)] rounded-xl">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-[var(--color-muted-bg)] border-b border-[var(--color-border)] text-left">
                  <th className="p-2">Field</th>
                  <th className="p-2">Keep (primary)</th>
                  <th className="p-2">Merge in (duplicate)</th>
                </tr>
              </thead>
              <tbody>
                {FIELDS.map(({ key, label }) => {
                  const primaryText = displayValue(key, primary, profiles);
                  const secondaryText = displayValue(key, secondary, profiles);
                  const identical = primaryText === secondaryText;
                  const chosen = choices[key] ?? "primary";
                  return (
                    <tr
                      key={key}
                      className="border-b border-[var(--color-border)] align-top"
                    >
                      <td className="p-2 text-[var(--color-muted)]">{label}</td>
                      <td
                        className={`p-2 ${
                          !identical && chosen === "primary"
                            ? "font-medium"
                            : ""
                        }`}
                      >
                        {identical ? (
                          primaryText
                        ) : (
                          <label className="flex gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name={`field-${key}`}
                              checked={chosen === "primary"}
                              onChange={() =>
                                setOverrides({ ...overrides, [key]: "primary" })
                              }
                            />
                            <span>{primaryText}</span>
                          </label>
                        )}
                      </td>
                      <td
                        className={`p-2 ${
                          !identical && chosen === "secondary"
                            ? "font-medium"
                            : ""
                        }`}
                      >
                        {identical ? (
                          <span className="text-[var(--color-muted)]">
                            same
                          </span>
                        ) : (
                          <label className="flex gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name={`field-${key}`}
                              checked={chosen === "secondary"}
                              onChange={() =>
                                setOverrides({
                                  ...overrides,
                                  [key]: "secondary",
                                })
                              }
                            />
                            <span>{secondaryText}</span>
                          </label>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="text-sm text-[var(--color-muted)] border border-[var(--color-border)] rounded-lg p-3">
            <p className="font-medium text-foreground mb-1">What happens</p>
            <ul className="list-disc pl-5 flex flex-col gap-1">
              <li>
                Activity history and WhatsApp conversations from{" "}
                <span className="font-medium">{secondary.nama}</span> move to{" "}
                <span className="font-medium">{primary.nama}</span>.
              </li>
              <li>
                Current status ({leadStatusLabel(primary.status)}) stays as the
                primary lead&apos;s.
              </li>
              <li>
                <span className="font-medium">{secondary.nama}</span> is then
                deleted. This can&apos;t be undone.
              </li>
            </ul>
          </div>

          {error && (
            <p className="text-sm text-[var(--color-danger)]">{error}</p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleMerge}
              disabled={merging}
              className="bg-brand text-on-brand hover:bg-[var(--color-brand-hover)] rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {merging ? "Merging…" : "Merge leads"}
            </button>
            <button
              type="button"
              onClick={() => {
                setSecondary(null);
                setOverrides({});
              }}
              disabled={merging}
              className="border border-[var(--color-border)] rounded-lg px-4 py-2 text-sm hover:bg-[var(--color-muted-bg)]"
            >
              Pick a different lead
            </button>
          </div>
        </>
      )}
    </main>
  );
}
