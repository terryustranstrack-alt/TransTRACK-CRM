-- Jalankan file ini di Supabase Dashboard > SQL Editor.
-- Deteksi otomatis Business (TransTRACK / TransTRACK Academy) untuk chat
-- WhatsApp yang masuk, dalam 3 lapis:
--   1. Dari iklan Meta (Click-to-WhatsApp): Meta menyertakan data iklan di
--      pesan pertama. Admin memetakan tiap iklan ke Business + Product
--      sekali saja (tabel ad_sources).
--   2. Dari kata kunci di pesan pelanggan, mis. pesan pembuka iklan
--      "Halo, saya mau info Bootcamp" (tabel business_keyword_rules).
--   3. Tebakan AI dari isi chat (cuma kalau lapis 1 & 2 tidak menemukan).
-- Hasil deteksi disimpan di conversations, lalu diteruskan ke lead-nya —
-- HANYA mengisi field lead yang masih kosong, tidak pernah menimpa isian
-- manusia.

-- 1. Iklan yang pernah membawa chat masuk. source_id = ID iklan dari Meta.
create table if not exists ad_sources (
  id uuid primary key default gen_random_uuid(),
  source_id text not null unique,
  source_type text,
  headline text,
  body text,
  source_url text,
  media_url text,
  business_unit_id uuid references business_units(id) on delete set null,
  produk text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- 2. Aturan kata kunci: pesan pelanggan mengandung `keyword` → Business ini.
create table if not exists business_keyword_rules (
  id uuid primary key default gen_random_uuid(),
  keyword text not null,
  business_unit_id uuid not null references business_units(id) on delete cascade,
  produk text,
  created_at timestamptz not null default now()
);

-- 3. Hasil deteksi per percakapan.
alter table conversations add column if not exists business_unit_id uuid
  references business_units(id) on delete set null;
alter table conversations add column if not exists suggested_produk text;
alter table conversations add column if not exists business_detected_by text
  check (business_detected_by in ('ad', 'keyword', 'ai'));
alter table conversations add column if not exists ad_source_id uuid
  references ad_sources(id) on delete set null;
alter table conversations add column if not exists business_guess_attempts integer
  not null default 0;

-- Lead mencatat iklan yang membawanya (untuk laporan per iklan nanti).
alter table leads add column if not exists ad_source_id uuid
  references ad_sources(id) on delete set null;

-- Pilihan Source untuk lead dari iklan.
insert into lead_sources (name) values ('Meta Ads') on conflict (name) do nothing;

-- 4. RLS: semua user login boleh baca (untuk tampilan), cuma admin yang
--    boleh mengubah. Webhook menulis ad_sources pakai service-role.
do $$
declare t text;
begin
  foreach t in array array['ad_sources', 'business_keyword_rules']
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

-- 5. Ambil iklan dari chat yang SUDAH masuk sebelumnya (data iklan ikut
--    tersimpan di kolom messages.raw), supaya langsung muncul di Settings.
insert into ad_sources (source_id, source_type, headline, body, source_url, media_url, first_seen_at, last_seen_at)
select
  m.raw->'referral'->>'source_id',
  max(m.raw->'referral'->>'source_type'),
  max(m.raw->'referral'->>'headline'),
  max(m.raw->'referral'->>'body'),
  max(m.raw->'referral'->>'source_url'),
  max(coalesce(m.raw->'referral'->>'image_url', m.raw->'referral'->>'thumbnail_url')),
  min(m.created_at),
  max(m.created_at)
from messages m
where m.direction = 'inbound'
  and coalesce(m.raw->'referral'->>'source_id', '') <> ''
group by m.raw->'referral'->>'source_id'
on conflict (source_id) do nothing;

update conversations c
set ad_source_id = a.id
from messages m
join ad_sources a on a.source_id = m.raw->'referral'->>'source_id'
where m.conversation_id = c.id
  and m.direction = 'inbound'
  and c.ad_source_id is null;

update leads l
set ad_source_id = c.ad_source_id
from conversations c
where c.lead_id = l.id
  and c.ad_source_id is not null
  and l.ad_source_id is null;
