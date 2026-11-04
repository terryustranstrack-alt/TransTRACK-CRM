"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLeadFieldSettings } from "@/lib/useLeadFieldSettings";
import BusinessBadge from "@/components/BusinessBadge";
import type { BusinessUnit } from "@/lib/types";

const supabase = createClient();

// Contoh isi pesan sambutan Academy (placeholder), supaya admin langsung
// kebayang bedanya dengan sambutan umum TransTRACK.
const ACADEMY_PLACEHOLDER =
  "Halo! 👋 Terima kasih sudah menghubungi TransTRACK Academy. Supaya kami bisa bantu info kelas yang tepat, boleh dibantu isi:\n1. Nama\n2. Email\n3. Perusahaan/Instansi\n4. Kelas yang diminati";

// Bagian di Settings > AI chatbot: pesan sambutan berbeda per Business.
// Dipakai bot untuk kontak pertama kali kalau chat-nya sudah dikenali milik
// business itu (dari iklan Meta atau kata kunci di pesan pertama).
export default function BusinessWelcomeSettings() {
  const { businessUnits, reload } = useLeadFieldSettings();
  if (businessUnits.length === 0) return null;

  return (
    <div className="card p-5 flex flex-col gap-4">
      <div>
        <h3 className="card-title">Welcome message per business</h3>
        <p className="text-xs text-[var(--color-muted)]">
          Sent word-for-word the first time a new contact messages, before
          the AI takes over — use it to greet and ask for the details you
          want. A chat already recognised as a business (from the Meta ad
          they clicked or a keyword in their first message — see the Business
          detection tab) gets that business&apos;s message. Chats not yet
          recognised get the TransTRACK message.
        </p>
      </div>
      {/* TransTRACK & Academy berdampingan di layar lebar. */}
      <div className="grid gap-6 lg:grid-cols-2">
        {businessUnits.map((unit) => (
          <WelcomeEditor key={unit.id} unit={unit} onSaved={reload} />
        ))}
      </div>
    </div>
  );
}

// Satu kotak pesan sambutan untuk satu business, dengan tombol simpan sendiri.
function WelcomeEditor({
  unit,
  onSaved,
}: {
  unit: BusinessUnit;
  onSaved: () => void;
}) {
  const [text, setText] = useState(unit.welcome_message ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const changed = text !== (unit.welcome_message ?? "");

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    const { error } = await supabase
      .from("business_units")
      .update({ welcome_message: text.trim() })
      .eq("id", unit.id);
    setSaving(false);
    setMessage(error ? error.message : "Saved.");
    if (!error) onSaved();
  }

  return (
    <label className="flex flex-col gap-1">
      <BusinessBadge name={unit.name} />
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder={
          unit.name.toLowerCase().includes("academy")
            ? ACADEMY_PLACEHOLDER
            : "Greeting sent to new contacts for this business"
        }
        className="field"
      />
      <span className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={!changed || saving}
          className="btn-primary"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {message && (
          <span className="text-xs text-[var(--color-muted)]">{message}</span>
        )}
      </span>
    </label>
  );
}
