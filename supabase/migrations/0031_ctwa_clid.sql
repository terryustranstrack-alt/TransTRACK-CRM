-- Jalankan file ini di Supabase Dashboard > SQL Editor.
-- Simpan "ctwa_clid": kode klik unik yang Meta sertakan di pesan pertama
-- dari iklan Click-to-WhatsApp. Dikirim balik ke Meta saat lead pindah
-- tahap, supaya Meta tahu PASTI klik iklan mana yang jadi lead / deal
-- (lebih akurat daripada mencocokkan nomor HP yang diacak).
alter table conversations add column if not exists ctwa_clid text;
alter table leads add column if not exists ctwa_clid text;

-- Kode klik biasanya tersalin ke lead SEDIKIT SETELAH lead dibuat. Supaya
-- Meta tetap diberi tahu ("LeadSubmitted"), ping ke CRM juga dikirim saat
-- kode klik baru masuk ke lead — bukan cuma saat tahap berubah.
-- (Fungsi notify_meta_crm_event dari 0030 dipakai ulang apa adanya.)
drop trigger if exists meta_crm_event_status on public.leads;
create trigger meta_crm_event_status
after update of status, ctwa_clid on public.leads
for each row
when (
  old.status is distinct from new.status
  or (old.ctwa_clid is null and new.ctwa_clid is not null)
)
execute function public.notify_meta_crm_event();
