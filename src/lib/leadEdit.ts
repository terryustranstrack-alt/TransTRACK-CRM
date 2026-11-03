import type { Lead } from "@/lib/types";

// Bentuk data form "Edit Lead". Dipakai bareng oleh LeadDetail (halaman
// detail) dan ProspekTable (edit inline per baris) supaya logika edit lead
// cuma ditulis sekali di sini.
export type LeadEditForm = {
  nama: string;
  kontak: string;
  sumber: string;
  produk: string;
  estimasi_nilai: string; // string karena input, dikonversi ke number saat simpan
  kota: string;
  perusahaan: string;
  jabatan: string;
  email: string;
  catatan: string;
  next_step: string;
  next_step_due: string; // "YYYY-MM-DD" dari <input type="date">, "" kalau kosong
  assigned_to: string;
  business_unit_id: string; // "" kalau business belum dipilih
  custom_fields: Record<string, string>; // nilai field tambahan buatan admin
};

// Form kosong — titik awal sebelum ada lead yang dibuka.
export const EMPTY_LEAD_EDIT_FORM: LeadEditForm = {
  nama: "",
  kontak: "",
  sumber: "",
  produk: "",
  estimasi_nilai: "",
  kota: "",
  perusahaan: "",
  jabatan: "",
  email: "",
  catatan: "",
  next_step: "",
  next_step_due: "",
  assigned_to: "",
  business_unit_id: "",
  custom_fields: {},
};

// Buang nilai field tambahan yang kosong, supaya {"x": ""} dan {} dianggap
// sama (tidak tercatat sebagai "berubah" padahal user tidak mengisi apa-apa).
export function cleanCustomFields(
  values: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value.trim() !== ""),
  );
}

function sameCustomFields(
  a: Record<string, string>,
  b: Record<string, string>,
): boolean {
  const aKeys = Object.keys(a);
  return (
    aKeys.length === Object.keys(b).length && aKeys.every((k) => a[k] === b[k])
  );
}

// Isi form edit dari data lead yang sedang dibuka.
export function leadToEditForm(lead: Lead): LeadEditForm {
  return {
    nama: lead.nama,
    kontak: lead.kontak,
    sumber: lead.sumber ?? "",
    produk: lead.produk ?? "",
    estimasi_nilai:
      lead.estimasi_nilai != null ? String(lead.estimasi_nilai) : "",
    kota: lead.kota ?? "",
    perusahaan: lead.perusahaan ?? "",
    jabatan: lead.jabatan ?? "",
    email: lead.email ?? "",
    catatan: lead.catatan ?? "",
    next_step: lead.next_step ?? "",
    next_step_due: lead.next_step_due ? lead.next_step_due.slice(0, 10) : "",
    assigned_to: lead.assigned_to ?? "",
    business_unit_id: lead.business_unit_id ?? "",
    custom_fields: { ...(lead.custom_fields ?? {}) },
  };
}

// Bangun payload update untuk tabel `leads` dari form, plus daftar label
// field mana saja yang benar-benar berubah — dipakai untuk ringkasan di
// riwayat aktivitas ("Lead data updated: name, city."), bukan cuma "diedit".
//
// isAdmin menentukan apakah assignee boleh diubah: sales biasa (non-admin)
// tidak boleh memindahkan lead ke orang lain (lihat migration 0007), jadi
// nilai assignee-nya dikunci ke nilai lama.
export function buildLeadUpdate(
  form: LeadEditForm,
  lead: Lead,
  isAdmin: boolean,
): { update: Record<string, unknown>; changedLabels: string[] } {
  const sumberBaru = form.sumber || null;
  const produkBaru = form.produk || null;
  const estimasiBaru = form.estimasi_nilai ? Number(form.estimasi_nilai) : null;
  const kotaBaru = form.kota || null;
  const perusahaanBaru = form.perusahaan || null;
  const jabatanBaru = form.jabatan || null;
  const emailBaru = form.email.trim() || null;
  const nextStepBaru = form.next_step.trim() || null;
  const nextStepDueBaru = form.next_step_due || null;
  const assignedToBaru = isAdmin ? form.assigned_to || null : lead.assigned_to;
  const businessBaru = form.business_unit_id || null;
  const customFieldsBaru = cleanCustomFields(form.custom_fields);

  const changedLabels: string[] = [];
  if (form.nama !== lead.nama) changedLabels.push("name");
  if (form.kontak !== lead.kontak) changedLabels.push("contact");
  if (sumberBaru !== lead.sumber) changedLabels.push("source");
  if (produkBaru !== lead.produk) changedLabels.push("product");
  if (estimasiBaru !== lead.estimasi_nilai) {
    changedLabels.push("estimated value");
  }
  if (kotaBaru !== lead.kota) changedLabels.push("city");
  if (perusahaanBaru !== lead.perusahaan) changedLabels.push("company");
  if (jabatanBaru !== lead.jabatan) changedLabels.push("job title");
  if (emailBaru !== lead.email) changedLabels.push("email");
  if ((form.catatan || "") !== (lead.catatan || "")) {
    changedLabels.push("notes");
  }
  if (nextStepBaru !== lead.next_step) changedLabels.push("next step");
  // next_step_due dari database bisa "YYYY-MM-DD" penuh — samakan dulu 10
  // karakter pertamanya sebelum dibandingkan dengan nilai form.
  const leadNextStepDue = lead.next_step_due
    ? lead.next_step_due.slice(0, 10)
    : null;
  if (nextStepDueBaru !== leadNextStepDue) changedLabels.push("next step date");
  if (isAdmin && assignedToBaru !== lead.assigned_to) {
    changedLabels.push("assignee");
  }
  if (businessBaru !== lead.business_unit_id) changedLabels.push("business");
  if (!sameCustomFields(customFieldsBaru, cleanCustomFields(lead.custom_fields ?? {}))) {
    changedLabels.push("custom fields");
  }

  return {
    update: {
      nama: form.nama,
      kontak: form.kontak,
      sumber: sumberBaru,
      produk: produkBaru,
      estimasi_nilai: estimasiBaru,
      kota: kotaBaru,
      perusahaan: perusahaanBaru,
      jabatan: jabatanBaru,
      email: emailBaru,
      catatan: form.catatan,
      next_step: nextStepBaru,
      next_step_due: nextStepDueBaru,
      assigned_to: assignedToBaru,
      business_unit_id: businessBaru,
      custom_fields: customFieldsBaru,
      tanggal_update: new Date().toISOString(),
    },
    changedLabels,
  };
}
