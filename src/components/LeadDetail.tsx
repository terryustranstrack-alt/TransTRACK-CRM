"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { logNote } from "@/lib/activity";
import { useLeadStatusChange } from "@/components/CloseReasonDialog";
import LeadTimeline from "@/components/LeadTimeline";
import { notifyLeadsAssigned } from "@/app/push/actions";
import {
  buildLeadUpdate,
  EMPTY_LEAD_EDIT_FORM,
  leadToEditForm,
  type LeadEditForm,
} from "@/lib/leadEdit";
import { useSumberOptions } from "@/lib/useSumberOptions";
import { useLeadFieldSettings } from "@/lib/useLeadFieldSettings";
import LeadClassificationFields from "@/components/LeadClassificationFields";
import BusinessPicker from "@/components/BusinessPicker";
import BusinessBadge from "@/components/BusinessBadge";
import AdOriginTag from "@/components/AdOriginTag";
import { useAdHeadlines } from "@/lib/useAdHeadlines";
import { useProfiles, profileLabel } from "@/lib/useProfiles";
import { useCurrentProfile } from "@/lib/useCurrentProfile";
import SumberSelect from "@/components/SumberSelect";
import AssigneeSelect from "@/components/AssigneeSelect";
import CurrencyInput from "@/components/CurrencyInput";
import { nextStepState } from "@/lib/reminders";
import {
  LEAD_STATUSES,
  leadStatusLabel,
  type Lead,
  type LeadActivity,
  type LeadStatus,
} from "@/lib/types";

const supabase = createClient();

// Halaman detail satu lead: tampilkan datanya, izinkan edit/hapus/ganti
// status, dan tampilkan + tambah riwayat aktivitas (catatan & histori
// perubahan status).
export default function LeadDetail({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [lead, setLead] = useState<Lead | null>(null);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [catatanBaru, setCatatanBaru] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<LeadEditForm>(EMPTY_LEAD_EDIT_FORM);
  const [saving, setSaving] = useState(false);
  const sumberOptions = useSumberOptions();
  const { businessUnits, customFields } = useLeadFieldSettings();
  // Judul iklan Meta untuk label "From ad: …" di kepala halaman.
  const adHeadlines = useAdHeadlines();
  const profiles = useProfiles();
  const { profile: currentProfile } = useCurrentProfile();
  const [hasWaConversation, setHasWaConversation] = useState(false);

  async function loadLead() {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .single();

    if (error) {
      setError(error.message);
    } else {
      setLead(data as Lead);
      setError(null);
    }
    setLoading(false);
  }

  async function loadActivities() {
    const { data, error } = await supabase
      .from("lead_activities")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false });

    if (!error) {
      setActivities(data as LeadActivity[]);
    }
  }

  // Cek apakah lead ini punya percakapan WhatsApp terhubung, supaya bisa
  // tampilkan link pintasan "View in Inbox".
  async function loadWaConversation() {
    const { data } = await supabase
      .from("conversations")
      .select("id")
      .eq("lead_id", leadId)
      .maybeSingle();
    setHasWaConversation(!!data);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadLead();
    loadActivities();
    loadWaConversation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  // Ganti status lead (dropdown di halaman) lewat helper bersama: kalau
  // tujuannya Won/Lost, dialog alasan muncul dulu. Setelah tersimpan, data
  // lead + riwayat aktivitas dimuat ulang.
  const { requestStatusChange, dialog: closeReasonDialog } =
    useLeadStatusChange(() => {
      loadLead();
      loadActivities();
    }, setError);

  function handleStatusChange(status: LeadStatus) {
    if (lead) requestStatusChange([lead], status);
  }

  // Tambah catatan bebas ke riwayat aktivitas (form "Add Note").
  async function handleAddCatatan(e: FormEvent) {
    e.preventDefault();
    if (!lead || !catatanBaru.trim()) return;

    setSubmitting(true);
    const activityError = await logNote(
      supabase,
      leadId,
      catatanBaru.trim(),
    );
    if (activityError) {
      setError(activityError);
      setSubmitting(false);
      return;
    }

    const { error } = await supabase
      .from("leads")
      .update({ tanggal_update: new Date().toISOString() })
      .eq("id", leadId);

    setSubmitting(false);

    if (error) {
      setError(error.message);
      return;
    }
    setCatatanBaru("");
    loadLead();
    loadActivities();
  }

  // Isi form edit dengan data lead saat ini, lalu buka mode edit.
  function startEdit() {
    if (!lead) return;
    setEditForm(leadToEditForm(lead));
    setIsEditing(true);
  }

  // Simpan perubahan dari form edit. Payload update + daftar field yang
  // benar-benar berubah dibangun di buildLeadUpdate (dipakai bareng dengan
  // ProspekTable). Ringkasan perubahannya dicatat ke riwayat aktivitas
  // ("Lead data updated: name, product.") bukan cuma "diedit".
  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!lead) return;
    setSaving(true);

    const { update, changedLabels } = buildLeadUpdate(
      editForm,
      lead,
      !!currentProfile?.is_admin,
    );

    const { error } = await supabase
      .from("leads")
      .update(update)
      .eq("id", leadId);

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    if (changedLabels.length > 0) {
      const activityError = await logNote(
        supabase,
        leadId,
        `Lead data updated: ${changedLabels.join(", ")}.`,
      );
      if (activityError) setError(activityError);
    }
    // Lead dipindah ke sales lain → kirim notifikasi push ke sales itu.
    if (update.assigned_to !== lead.assigned_to) {
      void notifyLeadsAssigned([leadId], update.assigned_to as string | null);
    }

    setSaving(false);
    setIsEditing(false);
    loadLead();
    loadActivities();
  }

  // Hapus lead — pakai pola "klik dua kali untuk konfirmasi": klik pertama
  // cuma ubah teks tombol jadi "Confirm delete?", klik kedua baru benar-benar
  // menghapus. Kalau tombol kehilangan fokus (onBlur di JSX di bawah),
  // konfirmasi dibatalkan lagi supaya tidak ke-klik tidak sengaja nanti.
  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setDeleting(true);
    const { error } = await supabase.from("leads").delete().eq("id", leadId);

    if (error) {
      setError(error.message);
      setDeleting(false);
      return;
    }
    router.push("/");
  }

  if (loading) return <LeadDetailSkeleton />;
  if (error) {
    return <p className="p-8 text-sm text-[var(--color-danger)]">Failed to load: {error}</p>;
  }
  if (!lead) return <p className="p-8 text-sm text-[var(--color-muted)]">Lead not found.</p>;

  const assignee = profiles.find((p) => p.id === lead.assigned_to);

  // Tata letak: kepala halaman (nama, status, tombol aksi) di atas, lalu
  // dua kolom di layar lebar — data lead di kiri, catatan & timeline di
  // kanan. Di telepon semuanya bertumpuk.
  return (
    <main className="p-4 sm:p-8 w-full max-w-6xl flex flex-col gap-6">
      <Link
        href="/"
        className="text-sm text-[var(--color-muted)] hover:text-foreground hover:underline self-start"
      >
        ← Back to Board
      </Link>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <BusinessBadge
              size="md"
              name={businessUnits.find((b) => b.id === lead.business_unit_id)?.name}
            />
            <AdOriginTag
              adSourceId={lead.ad_source_id}
              headlines={adHeadlines}
              className="text-xs"
            />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight break-words">{lead.nama}</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            Added <span className="font-data">{new Date(lead.tanggal_masuk).toLocaleString("id-ID")}</span>
            {" · "}Updated{" "}
            <span className="font-data">{new Date(lead.tanggal_update).toLocaleString("id-ID")}</span>
          </p>
          {hasWaConversation && (
            <Link
              href="/inbox"
              className="inline-block mt-1 text-sm text-[var(--color-success)] hover:underline"
            >
              💬 Has a WhatsApp conversation — View in Inbox
            </Link>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {/* Status di kepala halaman: hal yang paling sering diubah. */}
          <label className="flex items-center gap-2 text-sm">
            <span className="text-[var(--color-muted)]">Status</span>
            <select
              value={lead.status}
              onChange={(e) => handleStatusChange(e.target.value as LeadStatus)}
              className="field font-medium"
            >
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {leadStatusLabel(s)}
                </option>
              ))}
            </select>
          </label>
          {!isEditing && currentProfile?.is_admin && (
            <Link href={`/leads/${lead.id}/merge`} className="btn-secondary">
              Merge
            </Link>
          )}
          {!isEditing && (
            <button type="button" onClick={startEdit} className="btn-secondary">
              Edit
            </button>
          )}
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            onBlur={() => setConfirmDelete(false)}
            className="btn-secondary text-[var(--color-danger)] border-[var(--color-danger)] hover:bg-red-50"
          >
            {deleting
              ? "Deleting..."
              : confirmDelete
                ? "Confirm delete?"
                : "Delete Lead"}
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5 items-start">
        <section className="card p-5 lg:col-span-2 min-w-0">
          <h2 className="card-title mb-4">{isEditing ? "Edit lead" : "Details"}</h2>
          {isEditing ? (
            <form onSubmit={handleSaveEdit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">Business</span>
                <BusinessPicker
                  value={editForm.business_unit_id}
                  produk={editForm.produk}
                  onChange={(patch) => setEditForm((f) => ({ ...f, ...patch }))}
                />
              </div>

              <EditField id="edit-nama" label="Name">
                <input
                  id="edit-nama"
                  required
                  value={editForm.nama}
                  onChange={(e) => setEditForm({ ...editForm, nama: e.target.value })}
                  className="field"
                />
              </EditField>

              <EditField id="edit-kontak" label="Contact (WhatsApp/phone number)">
                <input
                  id="edit-kontak"
                  required
                  value={editForm.kontak}
                  onChange={(e) => setEditForm({ ...editForm, kontak: e.target.value })}
                  className="field"
                />
              </EditField>

              <EditField id="edit-sumber" label="Source">
                <SumberSelect
                  id="edit-sumber"
                  value={editForm.sumber}
                  onChange={(sumber) => setEditForm({ ...editForm, sumber })}
                  options={sumberOptions}
                />
              </EditField>

              <EditField id="edit-perusahaan" label="Company">
                <input
                  id="edit-perusahaan"
                  value={editForm.perusahaan}
                  onChange={(e) => setEditForm({ ...editForm, perusahaan: e.target.value })}
                  className="field"
                />
              </EditField>

              <EditField id="edit-jabatan" label="Job title">
                <input
                  id="edit-jabatan"
                  value={editForm.jabatan}
                  onChange={(e) => setEditForm({ ...editForm, jabatan: e.target.value })}
                  className="field"
                />
              </EditField>

              <EditField id="edit-email" label="Email">
                <input
                  id="edit-email"
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="field"
                />
              </EditField>

              <EditField id="edit-kota" label="City/region">
                <input
                  id="edit-kota"
                  value={editForm.kota}
                  onChange={(e) => setEditForm({ ...editForm, kota: e.target.value })}
                  className="field"
                />
              </EditField>

              <LeadClassificationFields
                values={editForm}
                onChange={(patch) => setEditForm((f) => ({ ...f, ...patch }))}
                idPrefix="edit-"
                inputClassName="field"
                renderField={(label, htmlFor, control) => (
                  <EditField id={htmlFor} label={label}>
                    {control}
                  </EditField>
                )}
              />

              <EditField id="edit-estimasi_nilai" label="Estimated deal value">
                <CurrencyInput
                  id="edit-estimasi_nilai"
                  value={editForm.estimasi_nilai}
                  onChange={(estimasi_nilai) => setEditForm({ ...editForm, estimasi_nilai })}
                  className="field"
                />
              </EditField>

              <EditField id="edit-catatan" label="Notes / requirements">
                <textarea
                  id="edit-catatan"
                  value={editForm.catatan}
                  onChange={(e) => setEditForm({ ...editForm, catatan: e.target.value })}
                  rows={3}
                  className="field"
                />
              </EditField>

              <EditField id="edit-next_step" label="Next step">
                <input
                  id="edit-next_step"
                  value={editForm.next_step}
                  onChange={(e) => setEditForm({ ...editForm, next_step: e.target.value })}
                  placeholder="e.g. Send quote, call to confirm schedule"
                  className="field"
                />
              </EditField>

              <EditField id="edit-next_step_due" label="Next step due date">
                <input
                  id="edit-next_step_due"
                  type="date"
                  value={editForm.next_step_due}
                  onChange={(e) => setEditForm({ ...editForm, next_step_due: e.target.value })}
                  className="field"
                />
              </EditField>

              <EditField id="edit-assigned_to" label="Assigned to">
                {currentProfile?.is_admin ? (
                  <AssigneeSelect
                    id="edit-assigned_to"
                    value={editForm.assigned_to || null}
                    onChange={(assigned_to) =>
                      setEditForm({ ...editForm, assigned_to: assigned_to ?? "" })
                    }
                    profiles={profiles}
                  />
                ) : (
                  <p className="text-sm text-[var(--color-muted)] px-3 py-2 border border-[var(--color-border)] rounded-lg bg-[var(--color-muted-bg)]">
                    {currentProfile ? profileLabel(currentProfile) : "-"}
                  </p>
                )}
              </EditField>

              <div className="flex gap-2">
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? "Saving..." : "Save Changes"}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  disabled={saving}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <dl className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-4 gap-y-3 text-sm">
              <DetailRow label="Contact">
                <span className="font-data">{lead.kontak}</span>
              </DetailRow>
              <DetailRow label="Source">{lead.sumber || "-"}</DetailRow>
              <DetailRow label="Company">{lead.perusahaan || "-"}</DetailRow>
              <DetailRow label="Job title">{lead.jabatan || "-"}</DetailRow>
              <DetailRow label="Email">{lead.email || "-"}</DetailRow>
              <DetailRow label="City/region">{lead.kota || "-"}</DetailRow>
              <DetailRow label="Product/need">{lead.produk || "-"}</DetailRow>

              {/* Field tambahan buatan admin — cuma yang ada isinya, supaya
                  daftar tidak penuh "-" untuk field milik business lain. */}
              {customFields
                .filter((f) => lead.custom_fields?.[f.id])
                .map((f) => (
                  <DetailRow key={f.id} label={f.label}>
                    {lead.custom_fields[f.id]}
                  </DetailRow>
                ))}

              <DetailRow label="Estimated value">
                <span className="font-data">
                  {lead.estimasi_nilai != null
                    ? lead.estimasi_nilai.toLocaleString("id-ID")
                    : "-"}
                </span>
              </DetailRow>
              <DetailRow label="Next step">{lead.next_step || "-"}</DetailRow>
              <DetailRow label="Next step due">
                <NextStepDue due={lead.next_step_due} />
              </DetailRow>
              <DetailRow label="Assigned to">
                {assignee ? profileLabel(assignee) : "Unassigned"}
              </DetailRow>

              {lead.close_reason && (
                <DetailRow label={lead.status === "Hilang" ? "Lost reason" : "Won reason"}>
                  {lead.close_reason}
                  {lead.close_note && (
                    <span className="text-[var(--color-muted)]"> — {lead.close_note}</span>
                  )}
                </DetailRow>
              )}
            </dl>
          )}
        </section>
        {closeReasonDialog}

        <div className="lg:col-span-3 flex flex-col gap-6 min-w-0">
          {!isEditing && lead.catatan && (
            <section className="card p-5">
              <h2 className="card-title mb-3">Notes / requirements</h2>
              <p className="whitespace-pre-wrap text-sm">{lead.catatan}</p>
            </section>
          )}

          <section className="card p-5">
            <h2 className="card-title mb-3">Timeline</h2>
            <form onSubmit={handleAddCatatan} className="flex flex-col gap-2 mb-5">
              <textarea
                value={catatanBaru}
                onChange={(e) => setCatatanBaru(e.target.value)}
                placeholder="Add a new note..."
                className="field"
                rows={3}
              />
              <button
                type="submit"
                disabled={submitting || !catatanBaru.trim()}
                className="btn-primary self-start"
              >
                {submitting ? "Saving..." : "Add Note"}
              </button>
            </form>

            <LeadTimeline
              leadId={leadId}
              leadName={lead.nama}
              activities={activities}
              profiles={profiles}
            />
          </section>
        </div>
      </div>
    </main>
  );
}

// Satu baris di daftar data lead: label abu-abu di kiri, isi di kanan.
function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-[var(--color-muted)]">{label}</dt>
      <dd className="break-words">{children}</dd>
    </>
  );
}

// Satu isian di form Edit: label tebal di atas, kolom isian di bawahnya.
function EditField({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

// Tanggal jatuh tempo "next step": merah kalau sudah lewat, oranye kalau
// hari ini, biasa kalau masih nanti.
function NextStepDue({ due }: { due: string | null }) {
  if (!due) return <>-</>;
  const state = nextStepState(due);
  const dueText = new Date(due).toLocaleDateString("id-ID");
  if (state === "overdue") {
    return <span className="text-[var(--color-danger)] font-medium">{dueText} · overdue</span>;
  }
  if (state === "today") {
    return <span className="text-[var(--color-warning)] font-medium">{dueText} · due today</span>;
  }
  return <>{dueText}</>;
}

// Kerangka abu-abu berdenyut selama data lead dimuat.
function LeadDetailSkeleton() {
  return (
    <main className="p-4 sm:p-8 w-full max-w-6xl flex flex-col gap-6">
      <div className="skeleton h-4 w-28" />
      <div className="skeleton h-9 w-72" />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="skeleton h-96 lg:col-span-2" />
        <div className="skeleton h-96 lg:col-span-3" />
      </div>
    </main>
  );
}
