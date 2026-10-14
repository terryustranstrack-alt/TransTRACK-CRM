import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Middleware Next.js — jalan sebelum semua request diproses. Lihat
// updateSession() di lib/supabase/proxy.ts untuk logika sesungguhnya
// (refresh sesi login + proteksi halaman).
export function proxy(request: NextRequest) {
  return updateSession(request);
}

// Middleware jalan di semua route KECUALI file statis Next.js dan gambar,
// supaya tidak ikut memproses aset-aset itu. Juga dikecualikan:
//  - sw.js & manifest.webmanifest — file notifikasi push / pasang ke Home
//    Screen, harus selalu bisa diambil browser apa adanya;
//  - api/cron — dipanggil penjadwal Vercel (tanpa login); route-nya
//    menjaga diri sendiri dengan CRON_SECRET.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|api/cron|.*\\.png$).*)",
  ],
};
