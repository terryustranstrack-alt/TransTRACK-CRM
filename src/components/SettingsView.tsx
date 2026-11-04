"use client";

import { useEffect, useState, type ReactNode } from "react";
import PageHeader from "@/components/PageHeader";
import SettingsWhatsApp from "@/components/SettingsWhatsApp";
import SettingsChatbot from "@/components/SettingsChatbot";
import LeadFieldSettings from "@/components/LeadFieldSettings";
import BusinessDetectionSettings from "@/components/BusinessDetectionSettings";
import ForecastSettings from "@/components/ForecastSettings";

// Tab-tab Settings. Dulu semuanya bertumpuk di satu halaman panjang yang
// susah dicari; sekarang dipisah per topik. `key` juga dipakai di alamat
// (mis. /settings#chatbot) supaya tab yang terbuka bisa dibagikan/diingat.
const TABS: { key: string; label: string; render: () => ReactNode }[] = [
  { key: "whatsapp", label: "WhatsApp", render: () => <SettingsWhatsApp /> },
  { key: "chatbot", label: "Chatbot", render: () => <SettingsChatbot /> },
  {
    key: "lead-fields",
    label: "Lead fields",
    render: () => (
      <div className="card p-5">
        <LeadFieldSettings />
      </div>
    ),
  },
  {
    key: "business-detection",
    label: "Business detection",
    render: () => (
      <div className="card p-5">
        <BusinessDetectionSettings />
      </div>
    ),
  },
  {
    key: "forecast",
    label: "Forecast",
    render: () => (
      <div className="card p-5">
        <ForecastSettings />
      </div>
    ),
  },
];

export default function SettingsView() {
  const [active, setActive] = useState(TABS[0].key);

  // Buka tab sesuai alamat (#chatbot dsb.) saat halaman dibuka.
  useEffect(() => {
    const fromHash = window.location.hash.slice(1);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (TABS.some((t) => t.key === fromHash)) setActive(fromHash);
  }, []);

  function openTab(key: string) {
    setActive(key);
    window.history.replaceState(null, "", `#${key}`);
  }

  const current = TABS.find((t) => t.key === active) ?? TABS[0];

  return (
    <main className="p-4 sm:p-8 flex flex-col gap-6 w-full max-w-5xl">
      <PageHeader
        title="Settings"
        description="WhatsApp, chatbot, lead fields and reporting options"
      />

      {/* Deretan tab; di telepon bisa digeser ke samping. */}
      <div
        role="tablist"
        aria-label="Settings sections"
        className="flex gap-1 overflow-x-auto border-b border-[var(--color-border)] -mx-4 px-4 sm:mx-0 sm:px-0"
      >
        {TABS.map((tab) => {
          const selected = tab.key === current.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => openTab(tab.key)}
              className={`whitespace-nowrap px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                selected
                  ? "border-[var(--color-accent)] text-foreground"
                  : "border-transparent text-[var(--color-muted)] hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel">{current.render()}</div>
    </main>
  );
}
