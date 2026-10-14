-- Jalankan file ini di Supabase Dashboard > SQL Editor.
-- Notifikasi push (Phase D): tiap browser/HP yang menekan "Enable
-- notifications" menyimpan satu "alamat kirim" (subscription) di sini.
-- Server memakai alamat ini untuk mengirim notifikasi ke perangkat sales.
-- Tabel baru, tidak mengubah tabel lain; aman dideploy sebelum/sesudah.

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null default auth.uid()
    references profiles(id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  created_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;

-- Tiap user hanya mengelola perangkatnya sendiri. Pengiriman notifikasi
-- dilakukan server pakai service-role (melewati aturan ini).
create policy "manage own push subscriptions"
  on push_subscriptions for all
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
