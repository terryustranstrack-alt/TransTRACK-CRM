import type { MetadataRoute } from "next";

// "Web app manifest" — membuat CRM bisa dipasang ke Home Screen HP seperti
// aplikasi. Wajib untuk iPhone: Apple hanya mengizinkan notifikasi push
// untuk web yang sudah ditambahkan ke Home Screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TransTRACK CRM",
    short_name: "TransTRACK",
    description: "Track sales lead progress.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#171717",
    icons: [{ src: "/logo.png", sizes: "1254x1254", type: "image/png" }],
  };
}
