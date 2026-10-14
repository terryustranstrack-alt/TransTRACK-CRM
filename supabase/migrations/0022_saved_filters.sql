-- Jalankan file ini di Supabase Dashboard > SQL Editor.
-- "Saved views" di halaman Prospects: kombinasi filter (pencarian, sumber,
-- follow-up, rentang tanggal, brand) yang disimpan dengan nama, supaya bisa
-- dipakai lagi dengan sekali klik. Pribadi — tiap user cuma melihat miliknya.
-- Tabel baru, tidak mengubah tabel lain; aman dideploy sebelum/sesudah.

create table if not exists saved_filters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  name text not null,
  filters jsonb not null,
  created_at timestamptz not null default now()
);

alter table saved_filters enable row level security;

drop policy if exists "manage own saved filters" on saved_filters;
create policy "manage own saved filters"
  on saved_filters for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
