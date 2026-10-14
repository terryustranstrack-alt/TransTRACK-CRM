"use client";

import { useEffect, useState } from "react";
import {
  removePushSubscription,
  savePushSubscription,
  type BrowserSubscription,
} from "@/app/push/actions";

// Kunci publik VAPID dikirim browser dalam bentuk byte, bukan teks base64.
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

// iPhone/iPad yang membuka CRM dari Safari biasa (belum dipasang ke Home
// Screen) — di sini Apple tidak mengizinkan notifikasi sama sekali.
function isIosNotInstalled(): boolean {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const installed = window.matchMedia("(display-mode: standalone)").matches;
  return ios && !installed;
}

type State = "loading" | "unsupported" | "ios-install" | "blocked" | "off" | "on";

// Tombol "Enable notifications" di header (dan menu More di HP). Mendaftar
// service worker (public/sw.js), meminta izin notifikasi, lalu menyimpan
// "alamat kirim" perangkat ini ke server. Bisa dimatikan lagi.
export default function PushToggle({ className = "" }: { className?: string }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    async function init() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setState(isIosNotInstalled() ? "ios-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("blocked");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });
      const existing = await registration.pushManager.getSubscription();
      // Perangkat sudah terdaftar → simpan ulang ke server (kalau-kalau
      // akun yang login di browser ini berganti).
      if (existing) {
        await savePushSubscription(existing.toJSON() as BrowserSubscription);
      }
      setState(existing ? "on" : "off");
    }
    init().catch(() => setState("unsupported"));
  }, []);

  async function turnOn() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
        ),
      });
      const result = await savePushSubscription(sub.toJSON() as BrowserSubscription);
      setState(result.error ? "off" : "on");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading" || state === "unsupported") return null;

  if (state === "ios-install") {
    return (
      <span className={`text-xs text-[var(--color-muted)] ${className}`}>
        To get alerts: Share → Add to Home Screen
      </span>
    );
  }
  if (state === "blocked") {
    return (
      <span
        className={`text-xs text-[var(--color-muted)] ${className}`}
        title="Allow notifications for this site in your browser settings"
      >
        Alerts blocked
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={state === "on" ? turnOff : turnOn}
      disabled={busy}
      title={state === "on" ? "Turn off alerts on this device" : undefined}
      className={`text-left disabled:opacity-50 ${
        state === "on"
          ? "text-[var(--color-muted)] hover:text-foreground"
          : "text-accent font-medium hover:underline"
      } ${className}`}
    >
      {state === "on" ? "🔔 Alerts on" : "Enable notifications"}
    </button>
  );
}
