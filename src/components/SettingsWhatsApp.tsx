"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { syncTemplates } from "@/app/inbox/actions";
import { useTemplates } from "@/lib/useTemplates";
import { useQuickReplies } from "@/lib/useQuickReplies";

const supabase = createClient();

// Tab "WhatsApp" di Settings: daftar template resmi + quick replies.
export default function SettingsWhatsApp() {
  return (
    <div className="flex flex-col gap-6">
      <TemplatesSection />
      <QuickRepliesSection />
    </div>
  );
}

// Template pesan WhatsApp: dibuat & disetujui di WhatsApp Manager, lalu
// disalin ke CRM lewat tombol "Sync from Meta".
function TemplatesSection() {
  const { templates, loading, reload } = useTemplates(false);
  const [isPending, startTransition] = useTransition();
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  function handleSync() {
    setSyncMessage(null);
    startTransition(async () => {
      const result = await syncTemplates();
      if (result?.error) setSyncMessage(result.error);
      else {
        setSyncMessage("Templates synced.");
        reload();
      }
    });
  }

  return (
    <section className="card p-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="card-title">WhatsApp message templates</h2>
          <p className="text-xs text-[var(--color-muted)] mt-1">
            Templates are created and approved in WhatsApp Manager, then synced
            here. Only approved templates can be sent from the inbox.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSync}
          disabled={isPending}
          className="btn-secondary shrink-0"
        >
          {isPending ? "Syncing…" : "Sync from Meta"}
        </button>
      </div>
      {syncMessage && <p className="text-sm text-[var(--color-muted)]">{syncMessage}</p>}

      {loading ? (
        <div className="skeleton h-24" />
      ) : templates.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">No templates synced yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--color-border)] border border-[var(--color-border)] rounded-lg">
          {templates.map((t) => (
            <li key={t.id} className="p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">
                  {t.name}{" "}
                  <span className="text-[var(--color-muted)] font-normal">
                    ({t.language})
                  </span>
                </span>
                <span
                  className={`text-xs font-medium rounded-full px-2 py-0.5 ${
                    t.status === "APPROVED"
                      ? "bg-emerald-50 text-[var(--color-success)]"
                      : "bg-amber-50 text-[var(--color-warning)]"
                  }`}
                >
                  {t.status ?? "—"}
                </span>
              </div>
              {t.body_text && (
                <p className="text-xs text-[var(--color-muted)] mt-1 whitespace-pre-wrap">
                  {t.body_text}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Quick replies: potongan teks siap pakai yang bisa disisipkan saat membalas
// di inbox. Yang dibuat di sini milik bersama (owner_id null).
function QuickRepliesSection() {
  const { quickReplies, reload } = useQuickReplies();
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    if (!newTitle.trim() || !newBody.trim()) return;
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("quick_replies").insert({
      title: newTitle.trim(),
      body: newBody.trim(),
      owner_id: null,
      created_by: user?.id ?? null,
    });
    if (error) {
      setError(error.message);
      return;
    }
    setNewTitle("");
    setNewBody("");
    reload();
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("quick_replies").delete().eq("id", id);
    if (error) setError(error.message);
    else reload();
  }

  return (
    <section className="card p-5 flex flex-col gap-3">
      <div>
        <h2 className="card-title">Quick replies</h2>
        <p className="text-xs text-[var(--color-muted)] mt-1">
          Reusable snippets everyone can insert into a reply from the inbox.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Title (e.g. Office address)"
            className="field"
          />
          <textarea
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            placeholder="Message text"
            rows={4}
            className="field"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={!newTitle.trim() || !newBody.trim()}
            className="btn-primary self-start"
          >
            Add quick reply
          </button>
          {error && <p className="text-[var(--color-danger)] text-xs">{error}</p>}
        </div>

        <ul className="flex flex-col divide-y divide-[var(--color-border)] border border-[var(--color-border)] rounded-lg self-start w-full">
          {quickReplies.length === 0 && (
            <li className="p-3 text-sm text-[var(--color-muted)]">No quick replies yet.</li>
          )}
          {quickReplies.map((qr) => (
            <li key={qr.id} className="p-3 text-sm flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="font-medium block">
                  {qr.title}{" "}
                  {qr.owner_id && (
                    <span className="text-xs text-[var(--color-muted)] font-normal">
                      (personal)
                    </span>
                  )}
                </span>
                <span className="text-xs text-[var(--color-muted)] whitespace-pre-wrap">
                  {qr.body}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(qr.id)}
                className="text-xs text-[var(--color-danger)] hover:underline shrink-0"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
