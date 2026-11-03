-- Jalankan file ini di Supabase Dashboard > SQL Editor.
-- Data pelanggan yang bisa diatur sendiri oleh admin (dari halaman Settings):
--   1. "Business" — lead ini untuk TransTRACK atau TransTRACK Academy (dst.).
--      Terpisah dari tabel brands (brands = nomor WhatsApp); satu nomor WA
--      bisa menerima lead untuk beberapa business sekaligus.
--   2. Daftar pilihan Product, boleh dikaitkan ke satu business tertentu.
--   3. Daftar pilihan Source (dulu daftarnya tertanam di kode).
--   4. Field tambahan buatan admin (teks/angka/tanggal/dropdown), nilainya
--      disimpan di kolom leads.custom_fields.
--
-- Kolom leads.produk & leads.sumber TIDAK berubah (tetap teks) — daftar
-- baru ini cuma mengisi pilihan dropdown, jadi laporan, CSV, dan chatbot
-- yang sudah ada tetap jalan seperti biasa.

-- 1. Business.
create table if not exists business_units (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);
insert into business_units (name) values ('TransTRACK'), ('TransTRACK Academy')
on conflict (name) do nothing;

-- 2. Product. business_unit_id kosong = produk berlaku untuk semua business.
create table if not exists lead_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_unit_id uuid references business_units(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 3. Source. Diisi awal dengan daftar default lama + semua sumber yang
--    sudah pernah dipakai di leads, supaya tidak ada pilihan yang hilang.
create table if not exists lead_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);
insert into lead_sources (name)
select name from (
  values ('Instagram Ads'), ('Facebook Ads'), ('Referral'), ('Organic'),
         ('Website'), ('WhatsApp')
) as defaults(name)
union
select distinct trim(sumber) from leads where coalesce(trim(sumber), '') <> ''
on conflict (name) do nothing;

-- 4. Field tambahan. options cuma dipakai kalau field_type = 'select'.
--    business_unit_id kosong = field tampil untuk semua business.
create table if not exists lead_custom_fields (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  field_type text not null default 'text'
    check (field_type in ('text', 'number', 'date', 'select')),
  options text[] not null default '{}',
  business_unit_id uuid references business_units(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 5. Kolom baru di leads. Lead lama: business kosong, custom_fields {}.
alter table leads add column if not exists business_unit_id uuid
  references business_units(id) on delete set null;
alter table leads add column if not exists custom_fields jsonb not null default '{}';

-- 6. RLS: semua user login boleh BACA daftar-daftar ini (untuk dropdown),
--    cuma admin yang boleh tambah/ubah/hapus. Sama polanya dengan brands.
do $$
declare t text;
begin
  foreach t in array array['business_units', 'lead_products', 'lead_sources', 'lead_custom_fields']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "authenticated read %s" on %I', t, t);
    execute format(
      'create policy "authenticated read %s" on %I for select to authenticated using (true)',
      t, t);
    execute format('drop policy if exists "admin manage %s" on %I', t, t);
    execute format(
      'create policy "admin manage %s" on %I for all to authenticated
         using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin))
         with check (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin))',
      t, t);
  end loop;
end $$;
