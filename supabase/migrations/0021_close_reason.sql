-- Jalankan file ini di Supabase Dashboard > SQL Editor.
-- Menambah tiga kolom di tabel `leads` untuk mencatat HASIL AKHIR sebuah lead:
--  1. close_reason — alasan menang/kalah (mis. "Price", "Competitor").
--                    Wajib dipilih saat lead ditandai Lost; opsional saat Won.
--  2. close_note   — catatan tambahan bebas tentang alasan itu.
--  3. closed_at    — kapan lead ditandai Won/Lost (untuk laporan "berapa
--                    hari sampai closing").
--
-- Semua boleh kosong (nullable), tidak ada backfill — lead lama yang sudah
-- Won/Lost cukup tanpa alasan. Aman dijalankan kapan saja dan aman dideploy
-- sebelum atau sesudah migrasi ini. Tidak ada perubahan RLS/realtime.

alter table leads
  add column if not exists close_reason text;

alter table leads
  add column if not exists close_note text;

alter table leads
  add column if not exists closed_at timestamptz;
