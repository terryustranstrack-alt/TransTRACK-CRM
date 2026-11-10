-- Jalankan file ini di Supabase Dashboard > SQL Editor.
-- Tim sales per Business (TransTRACK / TransTRACK Academy).
-- Admin mencentang di halaman Sales Team: sales ini menangani business apa.
-- Seorang sales boleh masuk dua-duanya.
--
-- Efeknya ke chat & lead yang BELUM diklaim (pool "Unclaimed"):
--   * Business-nya sudah dikenali (TransTRACK / Academy) → cuma kelihatan
--     oleh sales di tim business itu (+ admin), dan notifikasi juga cuma ke
--     mereka.
--   * Business-nya belum dikenali → tetap kelihatan oleh semua sales di
--     brand (nomor WhatsApp) itu, seperti sebelumnya.
--   * Sales yang BELUM dicentang ke business mana pun tetap melihat semua
--     (supaya tidak ada yang tiba-tiba kehilangan chat sebelum admin
--     sempat mengatur tim).
-- Chat/lead yang sudah dipegang seseorang tidak berubah sama sekali.

-- 1. Keanggotaan tim: satu baris = satu sales di satu business.
create table if not exists profile_business_units (
  profile_id uuid not null references profiles(id) on delete cascade,
  business_unit_id uuid not null references business_units(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, business_unit_id)
);

alter table profile_business_units enable row level security;
drop policy if exists "authenticated read profile_business_units" on profile_business_units;
create policy "authenticated read profile_business_units"
  on profile_business_units for select to authenticated using (true);
drop policy if exists "admin manage profile_business_units" on profile_business_units;
create policy "admin manage profile_business_units"
  on profile_business_units for all to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));

-- 2. Satu aturan dipakai bersama oleh semua policy di bawah: bolehkah user
--    yang sedang login melihat chat/lead belum-diklaim dengan brand &
--    business ini?
create or replace function public.can_see_unclaimed(p_brand uuid, p_business uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.brand_id = p_brand
      and (
        p_business is null
        or not exists (select 1 from profile_business_units t where t.profile_id = p.id)
        or exists (
          select 1 from profile_business_units t
          where t.profile_id = p.id and t.business_unit_id = p_business
        )
      )
  );
$$;

-- 3. RLS leads: klausa pool belum-diklaim memakai aturan di atas.
--    Klausa assigned_to / created_by / is_admin TIDAK berubah.
drop policy if exists "sales read own leads, admin reads all" on leads;
create policy "sales read own leads, admin reads all"
  on leads for select to authenticated
  using (
    assigned_to = auth.uid()
    or created_by = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
    or (
      assigned_to is null and brand_id is not null
      and can_see_unclaimed(leads.brand_id, leads.business_unit_id)
    )
  );

drop policy if exists "sales update own leads, admin updates all" on leads;
create policy "sales update own leads, admin updates all"
  on leads for update to authenticated
  using (
    assigned_to = auth.uid()
    or created_by = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
    or (
      assigned_to is null and brand_id is not null
      and can_see_unclaimed(leads.brand_id, leads.business_unit_id)
    )
  )
  with check (
    assigned_to = auth.uid()
    or created_by = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
    or (
      assigned_to is null and brand_id is not null
      and can_see_unclaimed(leads.brand_id, leads.business_unit_id)
    )
  );

-- 4. RLS lead_activities: ikuti leads.
drop policy if exists "read activities of visible leads" on lead_activities;
create policy "read activities of visible leads"
  on lead_activities for select to authenticated
  using (
    exists (
      select 1 from leads l where l.id = lead_activities.lead_id
      and (
        l.assigned_to = auth.uid()
        or l.created_by = auth.uid()
        or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
        or (
          l.assigned_to is null and l.brand_id is not null
          and can_see_unclaimed(l.brand_id, l.business_unit_id)
        )
      )
    )
  );

drop policy if exists "insert activities of visible leads" on lead_activities;
create policy "insert activities of visible leads"
  on lead_activities for insert to authenticated
  with check (
    exists (
      select 1 from leads l where l.id = lead_activities.lead_id
      and (
        l.assigned_to = auth.uid()
        or l.created_by = auth.uid()
        or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
        or (
          l.assigned_to is null and l.brand_id is not null
          and can_see_unclaimed(l.brand_id, l.business_unit_id)
        )
      )
    )
  );

-- 5. RLS conversations.
drop policy if exists "read own or unclaimed conversations, admin reads all" on conversations;
create policy "read own or unclaimed conversations, admin reads all"
  on conversations for select to authenticated
  using (
    assigned_to = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
    or (
      assigned_to is null and brand_id is not null
      and can_see_unclaimed(conversations.brand_id, conversations.business_unit_id)
    )
  );

drop policy if exists "update own or unclaimed conversations, admin updates all" on conversations;
create policy "update own or unclaimed conversations, admin updates all"
  on conversations for update to authenticated
  using (
    assigned_to = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
    or (
      assigned_to is null and brand_id is not null
      and can_see_unclaimed(conversations.brand_id, conversations.business_unit_id)
    )
  )
  with check (
    assigned_to = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
    or (
      assigned_to is null and brand_id is not null
      and can_see_unclaimed(conversations.brand_id, conversations.business_unit_id)
    )
  );

-- 6. RLS messages: ikuti conversations.
drop policy if exists "read messages of visible conversations" on messages;
create policy "read messages of visible conversations"
  on messages for select to authenticated
  using (
    exists (
      select 1 from conversations c where c.id = messages.conversation_id
      and (
        c.assigned_to = auth.uid()
        or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
        or (
          c.assigned_to is null and c.brand_id is not null
          and can_see_unclaimed(c.brand_id, c.business_unit_id)
        )
      )
    )
  );

drop policy if exists "insert messages into visible conversations" on messages;
create policy "insert messages into visible conversations"
  on messages for insert to authenticated
  with check (
    exists (
      select 1 from conversations c where c.id = messages.conversation_id
      and (
        c.assigned_to = auth.uid()
        or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
        or (
          c.assigned_to is null and c.brand_id is not null
          and can_see_unclaimed(c.brand_id, c.business_unit_id)
        )
      )
    )
  );
