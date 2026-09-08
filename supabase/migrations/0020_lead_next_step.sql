-- Jalankan file ini di Supabase Dashboard > SQL Editor.
-- Menambah dua kolom di tabel `leads` untuk disiplin follow-up:
--  1. next_step      — teks bebas: apa langkah berikutnya untuk lead ini
--                      (mis. "Kirim penawaran", "Telepon konfirmasi jadwal").
--  2. next_step_due  — tanggal (tanpa jam) kapan langkah itu harus dilakukan.
--
-- Keduanya boleh kosong (nullable), tidak ada backfill. Aman dijalankan
-- kapan saja dan aman dideploy sebelum atau sesudah migrasi ini — baris lama
-- cukup punya nilai kosong. Tidak ada perubahan RLS/realtime.

alter table leads
  add column if not exists next_step text;

alter table leads
  add column if not exists next_step_due date;
