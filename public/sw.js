// Service worker TransTRACK CRM — berjalan di latar belakang browser/HP
// (bahkan saat tab CRM ditutup) untuk menampilkan notifikasi push.
// Isi notifikasi dikirim server (src/lib/push.ts) dalam bentuk JSON:
// { title, body, url } — url = halaman yang dibuka saat notifikasi disentuh.

self.addEventListener("push", (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/logo.png",
      badge: "/logo.png",
      tag: data.tag,
      data: { url: data.url || "/dashboard" },
    }),
  );
});

// Notifikasi disentuh: pakai tab CRM yang sudah terbuka kalau ada (pindah
// ke halaman tujuan), kalau tidak ada buka tab/jendela baru.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data.url, self.location.origin).href;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windows) => {
        const open = windows.find((w) => w.url.startsWith(self.location.origin));
        if (open) return open.navigate(url).then((w) => (w || open).focus());
        return self.clients.openWindow(url);
      }),
  );
});
