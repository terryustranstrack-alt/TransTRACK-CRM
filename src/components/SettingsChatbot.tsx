"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useBrands } from "@/lib/useBrands";
import BusinessWelcomeSettings from "@/components/BusinessWelcomeSettings";
import BusinessBotSettings from "@/components/BusinessBotSettings";
import type { BotConfig } from "@/lib/types";

const supabase = createClient();

// Tab "Chatbot" di Settings: tombol nyala/mati + batas balasan (per nomor
// WhatsApp), lalu pesan sambutan dan instruksi/FAQ per Business.
export default function SettingsChatbot() {
  return (
    <div className="flex flex-col gap-6">
      <BotSwitchSection />
      <BusinessWelcomeSettings />
      <BusinessBotSettings />
    </div>
  );
}

// Nyala/mati chatbot dan batas jumlah balasan bot per percakapan. Disimpan
// per brand (nomor WhatsApp) di tabel bot_config.
function BotSwitchSection() {
  const brands = useBrands();
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const [bot, setBot] = useState<BotConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Begitu daftar brand datang, mulai dari brand default (nomor yang sudah
  // jalan). Admin bisa ganti lewat dropdown.
  useEffect(() => {
    if (selectedBrandId || brands.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedBrandId((brands.find((b) => b.is_default) ?? brands[0]).id);
  }, [brands, selectedBrandId]);

  useEffect(() => {
    if (!selectedBrandId) return;
    async function loadBot() {
      setBot(null);
      const { data } = await supabase
        .from("bot_config")
        .select("*")
        .eq("brand_id", selectedBrandId)
        .single();
      if (data) setBot(data as BotConfig);
    }
    loadBot();
  }, [selectedBrandId]);

  async function handleSave() {
    if (!bot) return;
    setSaving(true);
    setMessage(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("bot_config")
      .update({
        // Pesan sambutan, instruksi & FAQ diatur per Business
        // (BusinessWelcomeSettings / BusinessBotSettings), bukan di sini.
        enabled: bot.enabled,
        max_replies_per_conversation: bot.max_replies_per_conversation,
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      })
      .eq("brand_id", bot.brand_id);
    setSaving(false);
    setMessage(error ? error.message : "Chatbot settings saved.");
  }

  return (
    <section className="card p-5 flex flex-col gap-4">
      <div>
        <h2 className="card-title">AI chatbot</h2>
        <p className="text-xs text-[var(--color-muted)] mt-1">
          When enabled, unclaimed incoming WhatsApp messages get an automatic
          reply from an AI assistant. It stops as soon as a person claims the
          conversation, and hands off on anything it&apos;s unsure about. It
          also reads each chat and fills in the lead&apos;s details (name,
          email, company, job title, city, needs) when the customer mentions
          them, creating a new lead if the number isn&apos;t in the CRM yet.
          Every auto-filled value is written to the lead&apos;s activity log so
          your team can check and correct it.
        </p>
      </div>

      {brands.length > 1 && (
        <label className="flex flex-col gap-1 max-w-xs">
          <span className="text-xs text-[var(--color-muted)]">Brand (WhatsApp number)</span>
          <select
            value={selectedBrandId ?? ""}
            onChange={(e) => setSelectedBrandId(e.target.value)}
            className="field"
          >
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {!bot ? (
        <div className="skeleton h-28" />
      ) : (
        <div className="flex flex-wrap items-end gap-6">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={bot.enabled}
              onChange={(e) => setBot({ ...bot, enabled: e.target.checked })}
              className="w-4 h-4"
            />
            Chatbot enabled
          </label>

          <label className="flex flex-col gap-1 w-56">
            <span className="text-xs text-[var(--color-muted)]">
              Max bot replies per conversation
            </span>
            <input
              type="number"
              min={1}
              value={bot.max_replies_per_conversation}
              onChange={(e) =>
                setBot({
                  ...bot,
                  max_replies_per_conversation: Number(e.target.value) || 1,
                })
              }
              className="field"
            />
          </label>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="btn-primary"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {message && (
              <span className="text-sm text-[var(--color-muted)]">{message}</span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
