-- Jalankan file ini di Supabase Dashboard > SQL Editor.
-- Kirim "ping" ke CRM (/api/meta/crm-event) setiap kali lead DITAMBAH atau
-- TAHAPNYA (status) BERUBAH — dari mana pun perubahannya. CRM lalu
-- meneruskannya ke Meta Conversions API (lihat src/lib/metaCapi.ts).
-- Pakai pg_net (fitur bawaan Supabase untuk memanggil alamat web dari
-- database) karena menu "Database Webhooks" belum aktif di proyek ini.
-- Ping dikirim di latar belakang: menyimpan lead tidak ikut melambat atau
-- gagal kalau CRM/Meta sedang bermasalah.

create extension if not exists pg_net;

create or replace function public.notify_meta_crm_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://transtrack-crm.vercel.app/api/meta/crm-event',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- Ganti dengan nilai env META_CAPI_WEBHOOK_SECRET di Vercel sebelum
      -- dijalankan (rahasia tidak disimpan di git).
      'x-webhook-secret', 'REPLACE_WITH_META_CAPI_WEBHOOK_SECRET'
    ),
    -- Bentuk isi sama seperti Database Webhook Supabase:
    -- { type, table, record, old_record }.
    body := jsonb_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'record', to_jsonb(NEW),
      'old_record', case when TG_OP = 'UPDATE' then to_jsonb(OLD) else null end
    ),
    timeout_milliseconds := 5000
  );
  return NEW;
end;
$$;

-- Lead baru.
drop trigger if exists meta_crm_event_insert on public.leads;
create trigger meta_crm_event_insert
after insert on public.leads
for each row execute function public.notify_meta_crm_event();

-- Lead pindah tahap (edit lain seperti nama/catatan tidak memicu ping).
drop trigger if exists meta_crm_event_status on public.leads;
create trigger meta_crm_event_status
after update of status on public.leads
for each row
when (old.status is distinct from new.status)
execute function public.notify_meta_crm_event();
