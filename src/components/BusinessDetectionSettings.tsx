"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { assignAdSource } from "@/app/settings/actions";
import {
  productsForBusiness,
  useLeadFieldSettings,
} from "@/lib/useLeadFieldSettings";
import BusinessPicker from "@/components/BusinessPicker";
import BusinessBadge from "@/components/BusinessBadge";
import SumberSelect from "@/components/SumberSelect";
import type { AdSource, BusinessKeywordRule, LeadProduct } from "@/lib/types";

const supabase = createClient();

const inputClass =
  "border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm";
const primaryButtonClass =
  "bg-brand text-on-brand hover:bg-[var(--color-brand-hover)] rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50";

// Bagian Settings "Business detection": admin mengatur bagaimana CRM
// mengenali apakah chat WhatsApp yang masuk untuk TransTRACK atau Academy
// (lihat src/lib/businessDetection.ts untuk logikanya).
export default function BusinessDetectionSettings() {
  const { businessUnits, products } = useLeadFieldSettings();
  const [ads, setAds] = useState<AdSource[]>([]);
  const [chatCountByAd, setChatCountByAd] = useState<Map<string, number>>(new Map());
  const [rules, setRules] = useState<BusinessKeywordRule[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [adsResult, chatsResult, rulesResult] = await Promise.all([
      supabase.from("ad_sources").select("*").order("last_seen_at", { ascending: false }),
      supabase.from("conversations").select("ad_source_id").not("ad_source_id", "is", null),
      supabase.from("business_keyword_rules").select("*").order("created_at"),
    ]);
    const counts = new Map<string, number>();
    for (const row of chatsResult.data ?? []) {
      const id = row.ad_source_id as string;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    // Iklan yang belum dipetakan ditaruh paling atas — itu yang perlu diurus.
    const sortedAds = ((adsResult.data ?? []) as AdSource[]).sort(
      (a, b) => Number(!!a.business_unit_id) - Number(!!b.business_unit_id),
    );
    setAds(sortedAds);
    setChatCountByAd(counts);
    setRules((rulesResult.data ?? []) as BusinessKeywordRule[]);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, [reload]);

  const unmappedCount = ads.filter((a) => !a.business_unit_id).length;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-medium">Business detection</h2>
      <p className="text-xs text-[var(--color-muted)]">
        Every incoming WhatsApp chat is checked automatically to see whether
        it is for TransTRACK or TransTRACK Academy, in this order:{" "}
        <b>1. the Meta ad</b> the customer clicked, <b>2. keywords</b> in their
        message, <b>3. an AI guess</b> from the chat. The result fills in the
        lead&apos;s Business and Product only when they are still empty, and
        every auto-fill is written to the lead&apos;s activity log.
      </p>
      {error && <p className="text-[var(--color-danger)] text-sm">{error}</p>}

      <div className="flex flex-col gap-2 border border-[var(--color-border)] rounded-lg p-3">
        <div>
          <h3 className="text-sm font-medium">
            1. Ads from Meta{" "}
            {unmappedCount > 0 && (
              <span className="ml-1 text-xs bg-[var(--color-warning)] text-white rounded-full px-2 py-0.5">
                {unmappedCount} new
              </span>
            )}
          </h3>
          <p className="text-xs text-[var(--color-muted)]">
            Ads appear here automatically after someone messages you from a
            Click-to-WhatsApp ad. Choose a business once per ad — future
            chats from it are labelled instantly, and existing chats from it
            are updated when you save.
          </p>
        </div>
        {ads.length === 0 ? (
          <p className="text-xs text-[var(--color-muted)]">
            No ad chats yet. Ads show up here after the first customer
            messages you from one.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {ads.map((ad) => (
              <AdRow
                key={ad.id}
                ad={ad}
                chatCount={chatCountByAd.get(ad.id) ?? 0}
                products={products}
                businessName={businessUnits.find((b) => b.id === ad.business_unit_id)?.name}
                onSaved={reload}
                onError={setError}
              />
            ))}
          </ul>
        )}
      </div>

      <KeywordRules
        rules={rules}
        products={products}
        businessUnits={businessUnits}
        onChanged={reload}
        onError={setError}
      />

      <div className="flex flex-col gap-1 border border-[var(--color-border)] rounded-lg p-3">
        <h3 className="text-sm font-medium">3. AI guess</h3>
        <p className="text-xs text-[var(--color-muted)]">
          If neither an ad nor a keyword matched, the AI reads what the
          customer wrote and picks a business (and product, if obvious) —
          up to 3 tries per chat, and only when it is fairly sure. These
          are marked &ldquo;AI reading the chat — please double-check&rdquo;
          in the lead&apos;s activity log. Product names in Settings &gt; Lead
          fields help the AI choose correctly.
        </p>
      </div>
    </section>
  );
}

// Satu iklan: gambar + judul + teks iklan, jumlah chat, dan pilihan
// Business/Product untuk iklan itu.
function AdRow({
  ad,
  chatCount,
  products,
  businessName,
  onSaved,
  onError,
}: {
  ad: AdSource;
  chatCount: number;
  products: LeadProduct[];
  businessName: string | undefined;
  onSaved: () => void;
  onError: (message: string | null) => void;
}) {
  const [businessUnitId, setBusinessUnitId] = useState(ad.business_unit_id ?? "");
  const [produk, setProduk] = useState(ad.produk ?? "");
  const [isPending, startTransition] = useTransition();
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  const changed =
    businessUnitId !== (ad.business_unit_id ?? "") || produk !== (ad.produk ?? "");

  function handleSave() {
    onError(null);
    setSavedMessage(null);
    startTransition(async () => {
      const result = await assignAdSource(ad.id, businessUnitId || null, produk || null);
      if (result.error) {
        onError(result.error);
        return;
      }
      setSavedMessage(
        result.updatedChats
          ? `Saved — ${result.updatedChats} existing chat(s) updated.`
          : "Saved.",
      );
      onSaved();
    });
  }

  return (
    <li
      className={`flex flex-col gap-2 rounded-lg p-3 border ${
        ad.business_unit_id
          ? "border-[var(--color-border)]"
          : "border-[var(--color-warning)] border-2"
      }`}
    >
      <div className="flex gap-3">
        {ad.media_url && !imageFailed && (
          // Gambar iklan dari server Meta — link-nya bisa kedaluwarsa, jadi
          // disembunyikan kalau gagal dimuat.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ad.media_url}
            alt=""
            onError={() => setImageFailed(true)}
            className="w-16 h-16 rounded object-cover shrink-0 bg-[var(--color-muted-bg)]"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {ad.business_unit_id ? (
              <BusinessBadge name={businessName} />
            ) : (
              <span className="text-[11px] font-semibold text-[var(--color-warning)]">
                NEW AD — choose a business
              </span>
            )}
            <span className="text-xs text-[var(--color-muted)]">
              {chatCount} chat{chatCount === 1 ? "" : "s"}
            </span>
          </div>
          <p className="text-sm font-medium break-words">
            {ad.headline || "(no headline)"}
          </p>
          {ad.body && (
            <p className="text-xs text-[var(--color-muted)] line-clamp-2 break-words">
              {ad.body}
            </p>
          )}
          <p className="text-[11px] text-[var(--color-muted)]">
            Ad ID {ad.source_id} · first chat{" "}
            {new Date(ad.first_seen_at).toLocaleDateString("id-ID")}
            {ad.source_url && (
              <>
                {" · "}
                <a
                  href={ad.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline"
                >
                  view ad
                </a>
              </>
            )}
          </p>
        </div>
      </div>
      <BusinessPicker
        value={businessUnitId}
        produk={produk}
        size="sm"
        onChange={(patch) => {
          setBusinessUnitId(patch.business_unit_id);
          setProduk(patch.produk);
        }}
      />
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex-1 min-w-48">
          <SumberSelect
            value={produk}
            onChange={setProduk}
            options={productsForBusiness(products, businessUnitId)}
            emptyLabel="- Product (optional) -"
            customPlaceholder="Type a product"
            className={`${inputClass} w-full`}
          />
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={!changed || isPending}
          className={primaryButtonClass}
        >
          {isPending ? "Saving…" : "Save"}
        </button>
      </div>
      {savedMessage && (
        <p className="text-xs text-[var(--color-success)]">{savedMessage}</p>
      )}
    </li>
  );
}

// Lapis 2: daftar aturan kata kunci + form tambah aturan baru.
function KeywordRules({
  rules,
  products,
  businessUnits,
  onChanged,
  onError,
}: {
  rules: BusinessKeywordRule[];
  products: LeadProduct[];
  businessUnits: { id: string; name: string }[];
  onChanged: () => void;
  onError: (message: string | null) => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [businessUnitId, setBusinessUnitId] = useState("");
  const [produk, setProduk] = useState("");

  async function handleAdd() {
    if (!keyword.trim() || !businessUnitId) return;
    onError(null);
    const { error } = await supabase.from("business_keyword_rules").insert({
      keyword: keyword.trim(),
      business_unit_id: businessUnitId,
      produk: produk || null,
    });
    if (error) {
      onError(error.message);
      return;
    }
    setKeyword("");
    setProduk("");
    onChanged();
  }

  async function handleDelete(id: string) {
    onError(null);
    const { error } = await supabase.from("business_keyword_rules").delete().eq("id", id);
    if (error) onError(error.message);
    else onChanged();
  }

  const nameOf = (id: string) => businessUnits.find((b) => b.id === id)?.name;

  return (
    <div className="flex flex-col gap-2 border border-[var(--color-border)] rounded-lg p-3">
      <div>
        <h3 className="text-sm font-medium">2. Keywords in the customer&apos;s message</h3>
        <p className="text-xs text-[var(--color-muted)]">
          Tip: in each Meta ad, set the pre-filled message to include a
          keyword, e.g. &ldquo;Halo, saya mau info <b>Bootcamp</b>&rdquo; for
          Academy ads. Also catches chats from your Instagram bio or
          website link. Not case-sensitive; the longest matching keyword wins.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="Keyword, e.g. bootcamp"
          className={inputClass}
        />
        <BusinessPicker
          value={businessUnitId}
          produk={produk}
          size="sm"
          onChange={(patch) => {
            setBusinessUnitId(patch.business_unit_id);
            setProduk(patch.produk);
          }}
        />
        <div className="flex flex-wrap items-start gap-2">
          <div className="flex-1 min-w-48">
            <SumberSelect
              value={produk}
              onChange={setProduk}
              options={productsForBusiness(products, businessUnitId)}
              emptyLabel="- Product (optional) -"
              customPlaceholder="Type a product"
              className={`${inputClass} w-full`}
            />
          </div>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!keyword.trim() || !businessUnitId}
            className={primaryButtonClass}
          >
            Add rule
          </button>
        </div>
      </div>
      {rules.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)]">No keyword rules yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--color-border)]">
          {rules.map((r) => (
            <li key={r.id} className="py-2 text-sm flex items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <span className="font-medium">&ldquo;{r.keyword}&rdquo;</span>
                <span className="text-[var(--color-muted)]">→</span>
                <BusinessBadge name={nameOf(r.business_unit_id)} />
                {r.produk && (
                  <span className="text-xs text-[var(--color-muted)]">{r.produk}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleDelete(r.id)}
                className="text-xs text-[var(--color-danger)] hover:underline shrink-0"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
