"use client";

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { logNote } from "@/lib/activity";
import { useLeadStatusChange } from "@/components/CloseReasonDialog";
import { notifyLeadsAssigned } from "@/app/push/actions";
import {
  buildLeadUpdate,
  leadToEditForm,
  type LeadEditForm,
} from "@/lib/leadEdit";
import { linkConversationToLead } from "@/app/inbox/actions";
import { useSumberOptions } from "@/lib/useSumberOptions";
import SumberSelect from "@/components/SumberSelect";
import AssigneeSelect from "@/components/AssigneeSelect";
import CurrencyInput from "@/components/CurrencyInput";
import LeadForm from "@/components/LeadForm";
import {
  LEAD_STATUSES,
  leadStatusLabel,
  type Conversation,
  type Lead,
  type LeadActivity,
  type LeadStatus,
  type Profile,
} from "@/lib/types";

const supabase = createClient();

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-[var(--color-muted)]">{label}</span>
      {children}
    </label>
  );
}

// Panel di sisi kanan inbox: satu-satunya tempat untuk semua hal soal lead
// dari dalam percakapan — link/buat lead, edit semua data lead, ganti status,
// dan lihat 5 aktivitas terakhir. Tidak perlu buka halaman lead terpisah.
export default function LeadContextPanel({
  conversation,
  lead,
  allLeads,
  profiles,
  currentProfile,
  onChanged,
  mobileOpen = false,
  onCloseMobile,
}: {
  conversation: Conversation;
  lead: Lead | null;
  allLeads: Lead[];
  profiles: Profile[];
  currentProfile: Profile | null;
  onChanged: () => void;
  // Di telepon panel ini jadi drawer layar penuh; di desktop tetap kolom
  // ketiga yang selalu tampil (props ini diabaikan lewat breakpoint `lg:`).
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}) {
  const isAdmin = !!currentProfile?.is_admin;
  const sumberOptions = useSumberOptions();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Mode "cari / buat lead" — selalu aktif kalau belum ada lead, atau kalau
  // user menekan "Change".
  const [search, setSearch] = useState("");
  const [showNewLeadForm, setShowNewLeadForm] = useState(false);
  const [changing, setChanging] = useState(false);

  // Form edit data lead (kalau sudah ada lead).
  const [editForm, setEditForm] = useState<LeadEditForm | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [activities, setActivities] = useState<LeadActivity[]>([]);

  async function loadActivities(leadId: string) {
    const { data } = await supabase
      .from("lead_activities")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(5);
    if (data) setActivities(data as LeadActivity[]);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEditForm(lead ? leadToEditForm(lead) : null);
    setChanging(false);
    setShowNewLeadForm(false);
    setSearch("");
    setError(null);
    if (lead) loadActivities(lead.id);
    else setActivities([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?.id]);

  const searchResults = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return [];
    return allLeads
      .filter(
        (l) =>
          l.nama.toLowerCase().includes(keyword) || l.kontak.includes(keyword),
      )
      .slice(0, 8);
  }, [search, allLeads]);

  function handleLink(leadId: string) {
    setError(null);
    startTransition(async () => {
      const result = await linkConversationToLead(conversation.id, leadId);
      if (result?.error) {
        setError(result.error);
      } else {
        setChanging(false);
        setSearch("");
        onChanged();
      }
    });
  }

  function handleNewLeadSaved(leadId: string) {
    setError(null);
    startTransition(async () => {
      const result = await linkConversationToLead(conversation.id, leadId);
      if (result?.error) {
        setError(result.error);
      } else {
        setShowNewLeadForm(false);
        setChanging(false);
        onChanged();
      }
    });
  }

  // Ganti status lewat helper bersama — Won/Lost minta alasan dulu.
  const { requestStatusChange, dialog: closeReasonDialog } =
    useLeadStatusChange(() => {
      onChanged();
      if (lead) loadActivities(lead.id);
    }, setError);

  function handleStatus(next: LeadStatus) {
    if (!lead) return;
    setError(null);
    requestStatusChange([lead], next);
  }

  async function handleSaveEdit() {
    if (!lead || !editForm) return;
    setSavingEdit(true);
    setError(null);

    const { update, changedLabels } = buildLeadUpdate(editForm, lead, isAdmin);
    const { error: updateError } = await supabase
      .from("leads")
      .update(update)
      .eq("id", lead.id);

    if (updateError) {
      setError(updateError.message);
      setSavingEdit(false);
      return;
    }
    if (changedLabels.length > 0) {
      await logNote(
        supabase,
        lead.id,
        `Lead data updated: ${changedLabels.join(", ")}.`,
      );
    }
    // Lead dipindah ke sales lain → kirim notifikasi push ke sales itu.
    if (update.assigned_to !== lead.assigned_to) {
      void notifyLeadsAssigned([lead.id], update.assigned_to as string | null);
    }
    setSavingEdit(false);
    onChanged();
    loadActivities(lead.id);
  }

  const showPicker = !lead || changing;

  return (
    <aside
      className={`w-full lg:w-80 lg:shrink-0 border-l border-[var(--color-border)] bg-[var(--color-surface)] overflow-y-auto p-3 text-sm flex-col gap-3 lg:static lg:flex ${
        mobileOpen ? "flex fixed inset-0 z-50" : "hidden lg:flex"
      }`}
    >
      <div className="lg:hidden flex items-center justify-between mb-1">
        <span className="font-semibold text-base">Lead</span>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close"
          className="p-1 text-[var(--color-muted)] hover:text-foreground text-lg leading-none"
        >
          ✕
        </button>
      </div>
      {error && <p className="text-[var(--color-danger)] text-xs">{error}</p>}

      {showPicker ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-medium">
              {lead ? "Change lead" : "Link to a lead"}
            </span>
            {lead && (
              <button
                type="button"
                onClick={() => setChanging(false)}
                className="text-xs text-[var(--color-muted)] hover:underline"
              >
                Cancel
              </button>
            )}
          </div>

          {showNewLeadForm ? (
            <>
              <button
                type="button"
                onClick={() => setShowNewLeadForm(false)}
                className="text-xs text-[var(--color-muted)] self-start hover:underline"
              >
                ← back to search
              </button>
              <LeadForm
                initialValues={{
                  kontak: conversation.external_contact_id,
                  nama: conversation.display_name ?? "",
                  sumber: "WhatsApp",
                }}
                onSaved={handleNewLeadSaved}
                lockContact
              />
            </>
          ) : (
            <>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search lead name/number…"
                className="border border-[var(--color-border)] rounded-lg px-2 py-1"
              />
              {searchResults.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {searchResults.map((l) => (
                    <li key={l.id}>
                      <button
                        type="button"
                        onClick={() => handleLink(l.id)}
                        disabled={isPending}
                        className="text-left w-full px-2 py-1 rounded-lg hover:bg-[var(--color-muted-bg)] disabled:opacity-50"
                      >
                        {l.nama} · {l.kontak}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                onClick={() => setShowNewLeadForm(true)}
                className="border border-[var(--color-border)] rounded-lg px-2 py-1 self-start hover:bg-[var(--color-muted-bg)]"
              >
                + Create new lead
              </button>
            </>
          )}
        </div>
      ) : (
        lead &&
        editForm && (
          <>
            <div className="flex items-start justify-between gap-2">
              <Link
                href={`/leads/${lead.id}`}
                className="font-medium hover:underline break-words"
              >
                {lead.nama}
              </Link>
              <button
                type="button"
                onClick={() => setChanging(true)}
                className="text-xs text-[var(--color-muted)] hover:underline shrink-0"
              >
                Change
              </button>
            </div>

            <Field label="Status">
              <select
                value={lead.status}
                onChange={(e) => handleStatus(e.target.value as LeadStatus)}
                className="border border-[var(--color-border)] rounded-lg px-2 py-1"
              >
                {LEAD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {leadStatusLabel(s)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Name">
              <input
                value={editForm.nama}
                onChange={(e) =>
                  setEditForm({ ...editForm, nama: e.target.value })
                }
                className="border border-[var(--color-border)] rounded-lg px-2 py-1 w-full"
              />
            </Field>
            <Field label="Contact (WhatsApp/phone)">
              <input
                value={editForm.kontak}
                readOnly
                title="Locked to this WhatsApp chat"
                className="border border-[var(--color-border)] rounded-lg px-2 py-1 w-full bg-[var(--color-muted-bg)] text-[var(--color-muted)]"
              />
            </Field>
            <Field label="Source">
              <SumberSelect
                value={editForm.sumber}
                onChange={(sumber) => setEditForm({ ...editForm, sumber })}
                options={sumberOptions}
              />
            </Field>
            <Field label="Company">
              <input
                value={editForm.perusahaan}
                onChange={(e) =>
                  setEditForm({ ...editForm, perusahaan: e.target.value })
                }
                className="border border-[var(--color-border)] rounded-lg px-2 py-1 w-full"
              />
            </Field>
            <Field label="Job title">
              <input
                value={editForm.jabatan}
                onChange={(e) =>
                  setEditForm({ ...editForm, jabatan: e.target.value })
                }
                className="border border-[var(--color-border)] rounded-lg px-2 py-1 w-full"
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={editForm.email}
                onChange={(e) =>
                  setEditForm({ ...editForm, email: e.target.value })
                }
                className="border border-[var(--color-border)] rounded-lg px-2 py-1 w-full"
              />
            </Field>
            <Field label="City/region">
              <input
                value={editForm.kota}
                onChange={(e) =>
                  setEditForm({ ...editForm, kota: e.target.value })
                }
                className="border border-[var(--color-border)] rounded-lg px-2 py-1 w-full"
              />
            </Field>
            <Field label="Product/need of interest">
              <input
                value={editForm.produk}
                onChange={(e) =>
                  setEditForm({ ...editForm, produk: e.target.value })
                }
                className="border border-[var(--color-border)] rounded-lg px-2 py-1 w-full"
              />
            </Field>
            <Field label="Estimated deal value">
              <CurrencyInput
                value={editForm.estimasi_nilai}
                onChange={(estimasi_nilai) =>
                  setEditForm({ ...editForm, estimasi_nilai })
                }
                className="border border-[var(--color-border)] rounded-lg px-2 py-1 w-full"
              />
            </Field>
            <Field label="Notes / requirements">
              <textarea
                value={editForm.catatan}
                onChange={(e) =>
                  setEditForm({ ...editForm, catatan: e.target.value })
                }
                rows={3}
                className="border border-[var(--color-border)] rounded-lg px-2 py-1 w-full"
              />
            </Field>
            <Field label="Next step">
              <input
                value={editForm.next_step}
                onChange={(e) =>
                  setEditForm({ ...editForm, next_step: e.target.value })
                }
                placeholder="e.g. Send quote"
                className="border border-[var(--color-border)] rounded-lg px-2 py-1 w-full"
              />
            </Field>
            <Field label="Next step due date">
              <input
                type="date"
                value={editForm.next_step_due}
                onChange={(e) =>
                  setEditForm({ ...editForm, next_step_due: e.target.value })
                }
                className="border border-[var(--color-border)] rounded-lg px-2 py-1 w-full"
              />
            </Field>
            {isAdmin && (
              <Field label="Assigned to">
                <AssigneeSelect
                  value={editForm.assigned_to || null}
                  onChange={(assigned_to) =>
                    setEditForm({ ...editForm, assigned_to: assigned_to ?? "" })
                  }
                  profiles={profiles}
                />
              </Field>
            )}

            <button
              type="button"
              onClick={handleSaveEdit}
              disabled={savingEdit}
              className="bg-brand text-on-brand hover:bg-[var(--color-brand-hover)] rounded-lg px-3 py-1.5 font-medium transition-colors disabled:opacity-50"
            >
              {savingEdit ? "Saving…" : "Save lead"}
            </button>

            <div>
              <p className="text-xs text-[var(--color-muted)] mb-1">Recent activity</p>
              <ul className="flex flex-col gap-2">
                {activities.length === 0 && (
                  <li className="text-xs text-[var(--color-muted)]">None yet.</li>
                )}
                {activities.map((a) => (
                  <li key={a.id} className="text-xs">
                    <span className="text-[var(--color-muted)]">
                      {new Date(a.created_at).toLocaleDateString("id-ID")} ·{" "}
                    </span>
                    {a.type === "status_change"
                      ? `${
                          a.old_status ? leadStatusLabel(a.old_status) : "-"
                        } → ${a.new_status ? leadStatusLabel(a.new_status) : "-"}${
                          a.content ? ` (${a.content})` : ""
                        }`
                      : a.type === "whatsapp_message"
                        ? `WhatsApp: ${a.content}`
                        : a.content}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )
      )}
      {closeReasonDialog}
    </aside>
  );
}
