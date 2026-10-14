-- Jalankan file ini di Supabase Dashboard > SQL Editor.
-- Dua tabel baru untuk Phase B:
--  1. stage_probabilities — peluang closing (persen) untuk tiap status lead,
--     dipakai untuk "forecast" di Dashboard: nilai lead × peluang statusnya.
--     Diisi angka awal; admin bisa ubah di Settings > Forecast.
--  2. sales_targets — target bulanan per sales (jumlah deal Won + nilai Won),
--     ditampilkan di halaman Leaderboard. Diatur oleh admin.
-- Tabel baru saja, tidak mengubah tabel lain; aman dideploy sebelum/sesudah.

create table if not exists stage_probabilities (
  status text primary key
    check (status in ('Baru', 'Dihubungi', 'Tertarik', 'Nego', 'Closing', 'Hilang')),
  probability int not null check (probability between 0 and 100)
);

insert into stage_probabilities (status, probability) values
  ('Baru', 10),
  ('Dihubungi', 20),
  ('Tertarik', 40),
  ('Nego', 70),
  ('Closing', 100),
  ('Hilang', 0)
on conflict (status) do nothing;

alter table stage_probabilities enable row level security;

drop policy if exists "authenticated read stage probabilities" on stage_probabilities;
create policy "authenticated read stage probabilities"
  on stage_probabilities for select to authenticated using (true);

drop policy if exists "admin update stage probabilities" on stage_probabilities;
create policy "admin update stage probabilities"
  on stage_probabilities for update to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));

create table if not exists sales_targets (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  month date not null,  -- selalu tanggal 1 bulan itu, mis. 2026-10-01
  target_won int not null default 0 check (target_won >= 0),
  target_value numeric not null default 0 check (target_value >= 0),
  unique (profile_id, month)
);

alter table sales_targets enable row level security;

-- Semua user login boleh lihat target (leaderboard terbuka untuk tim);
-- hanya admin yang boleh mengatur.
drop policy if exists "authenticated read sales targets" on sales_targets;
create policy "authenticated read sales targets"
  on sales_targets for select to authenticated using (true);

drop policy if exists "admin manage sales targets" on sales_targets;
create policy "admin manage sales targets"
  on sales_targets for all to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));
