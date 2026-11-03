import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Android hanya mau membaca assetlinks.json (bukti aplikasi APK milik
  // situs ini) kalau dikirim sebagai JSON, bukan teks biasa.
  async headers() {
    return [
      {
        source: "/.well-known/assetlinks.json",
        headers: [{ key: "Content-Type", value: "application/json" }],
      },
    ];
  },
};

export default nextConfig;
