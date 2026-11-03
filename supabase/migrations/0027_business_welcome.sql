-- Jalankan file ini di Supabase Dashboard > SQL Editor (SETELAH 0026).
-- Pesan sambutan chatbot per Business: chat yang sudah dikenali sebagai
-- TransTRACK Academy (dari iklan / kata kunci) disapa dengan pesan khusus
-- Academy, bukan pesan sambutan umum TransTRACK. Kosong = pakai pesan
-- sambutan umum di pengaturan chatbot (bot_config.welcome_message).
alter table business_units add column if not exists welcome_message text
  not null default '';
