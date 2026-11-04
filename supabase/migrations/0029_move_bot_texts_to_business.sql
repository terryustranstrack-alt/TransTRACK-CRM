-- Jalankan file ini di Supabase Dashboard > SQL Editor (SETELAH 0028).
-- Pesan sambutan, instruksi & FAQ chatbot sekarang diatur per Business
-- saja (kotak umum di Settings dihapus). Salin teks umum yang lama ke
-- SETIAP business yang kotaknya masih kosong, supaya bot tetap menjawab
-- seperti sebelumnya sampai admin menyesuaikan teks masing-masing business.
update business_units bu set
  welcome_message = case when bu.welcome_message = '' then bc.welcome_message else bu.welcome_message end,
  bot_prompt      = case when bu.bot_prompt = ''      then bc.system_prompt   else bu.bot_prompt end,
  bot_faq         = case when bu.bot_faq = ''         then bc.faq             else bu.bot_faq end
from (select welcome_message, system_prompt, faq from bot_config order by updated_at desc nulls last limit 1) bc;
