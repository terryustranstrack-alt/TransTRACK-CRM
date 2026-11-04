"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLeadFieldSettings } from "@/lib/useLeadFieldSettings";
import BusinessBadge from "@/components/BusinessBadge";
import type { BusinessUnit } from "@/lib/types";

const supabase = createClient();

// Contoh isi untuk Academy (placeholder), supaya admin langsung kebayang
// bedanya dengan instruksi umum TransTRACK.
const ACADEMY_PROMPT_PLACEHOLDER =
  "You are the assistant for TransTRACK Academy, which runs training classes and bootcamps. Answer questions about class schedules, fees and registration, and offer to connect them with our admissions team.";
const ACADEMY_FAQ_PLACEHOLDER =
  "Q: What classes are available?\nA: ...\n\nQ: How much does it cost?\nA: ...\n\nQ: Is there a certificate?\nA: ...";

// Bagian di Settings > AI chatbot: instruksi (system prompt) & FAQ berbeda
// per Business. Dipakai AI saat membalas chat yang sudah dikenali milik
// business itu (dari iklan, kata kunci, atau tebakan AI).
export default function BusinessBotSettings() {
  const { businessUnits, reload } = useLeadFieldSettings();
  if (businessUnits.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 border border-[var(--color-border)] rounded-lg p-3">
      <div>
        <h3 className="text-sm font-medium">Bot instructions &amp; FAQ per business</h3>
        <p className="text-xs text-[var(--color-muted)]">
          When a chat is recognised as a business (from the Meta ad, a
          keyword, or the AI guess — see Business detection below), the bot
          answers using that business&apos;s instructions and FAQ instead of
          the general ones above. Leave a box blank to keep using the general
          version for that part.
        </p>
      </div>
      {businessUnits.map((unit) => (
        <BotInstructionsEditor key={unit.id} unit={unit} onSaved={reload} />
      ))}
    </div>
  );
}

// Dua kotak (instruksi + FAQ) untuk satu business, dengan tombol simpan sendiri.
function BotInstructionsEditor({
  unit,
  onSaved,
}: {
  unit: BusinessUnit;
  onSaved: () => void;
}) {
  const [prompt, setPrompt] = useState(unit.bot_prompt ?? "");
  const [faq, setFaq] = useState(unit.bot_faq ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const changed = prompt !== (unit.bot_prompt ?? "") || faq !== (unit.bot_faq ?? "");
  const isAcademy = unit.name.toLowerCase().includes("academy");

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    const { error } = await supabase
      .from("business_units")
      .update({ bot_prompt: prompt.trim(), bot_faq: faq.trim() })
      .eq("id", unit.id);
    setSaving(false);
    setMessage(error ? error.message : "Saved.");
    if (!error) onSaved();
  }

  return (
    <div className="flex flex-col gap-2">
      <BusinessBadge name={unit.name} />
      <label className="flex flex-col gap-1">
        <span className="text-xs text-[var(--color-muted)]">
          Instructions (who the bot is for this business, how it should behave)
        </span>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          placeholder={
            isAcademy ? ACADEMY_PROMPT_PLACEHOLDER : "Blank = use the general instructions above"
          }
          className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-[var(--color-muted)]">
          FAQ / reference info for this business
        </span>
        <textarea
          value={faq}
          onChange={(e) => setFaq(e.target.value)}
          rows={6}
          placeholder={
            isAcademy ? ACADEMY_FAQ_PLACEHOLDER : "Blank = use the general FAQ above"
          }
          className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm"
        />
      </label>
      <span className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={!changed || saving}
          className="bg-brand text-on-brand hover:bg-[var(--color-brand-hover)] rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {message && (
          <span className="text-xs text-[var(--color-muted)]">{message}</span>
        )}
      </span>
    </div>
  );
}
