-- Jalankan file ini di Supabase Dashboard > SQL Editor (SETELAH 0027).
-- Instruksi chatbot (system prompt) & FAQ per Business: chat yang sudah
-- dikenali sebagai TransTRACK Academy dijawab dengan pengetahuan soal kelas
-- & pelatihan, bukan soal produk GPS/armada TransTRACK. Kosong = pakai
-- system prompt / FAQ umum di pengaturan chatbot (bot_config).
alter table business_units add column if not exists bot_prompt text
  not null default '';
alter table business_units add column if not exists bot_faq text
  not null default '';
