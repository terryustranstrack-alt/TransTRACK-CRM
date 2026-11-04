"use client";

import { useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLeadFieldSettings } from "@/lib/useLeadFieldSettings";
import type { BusinessUnit, CustomFieldType } from "@/lib/types";

const supabase = createClient();

const inputClass =
  "border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm";
const addButtonClass =
  "bg-brand text-on-brand hover:bg-[var(--color-brand-hover)] rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50";

const FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  select: "Dropdown",
};

type ManagedTable =
  | "business_units"
  | "lead_products"
  | "lead_sources"
  | "lead_custom_fields";

// Pecah teks pilihan dropdown (satu per baris atau dipisah koma) jadi array.
function parseOptions(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split(/[\n,]/)
        .map((o) => o.trim())
        .filter(Boolean),
    ),
  );
}

function businessName(units: BusinessUnit[], id: string | null): string {
  if (!id) return "All businesses";
  return units.find((b) => b.id === id)?.name ?? "All businesses";
}

// Bagian Settings "Lead fields": admin mengatur daftar Business, Product,
// Source, dan field tambahan yang tampil di semua form lead.
export default function LeadFieldSettings() {
  const { businessUnits, products, sources, customFields, reload } =
    useLeadFieldSettings();
  const [error, setError] = useState<string | null>(null);

  const [newBusiness, setNewBusiness] = useState("");
  const [newProduct, setNewProduct] = useState("");
  const [newProductBusiness, setNewProductBusiness] = useState("");
  const [newSource, setNewSource] = useState("");
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldType, setNewFieldType] = useState<CustomFieldType>("text");
  const [newFieldOptions, setNewFieldOptions] = useState("");
  const [newFieldBusiness, setNewFieldBusiness] = useState("");

  // Simpan satu baris baru ke salah satu tabel daftar, lalu muat ulang.
  // Return true kalau berhasil, supaya pemanggil tahu kapan mengosongkan input.
  async function insertRow(
    table: ManagedTable,
    row: Record<string, unknown>,
  ): Promise<boolean> {
    setError(null);
    const { error: insertError } = await supabase.from(table).insert(row);
    if (insertError) {
      setError(
        insertError.code === "23505"
          ? "That name already exists."
          : insertError.message,
      );
      return false;
    }
    await reload();
    return true;
  }

  // Hapus satu baris. Lead yang sudah memakai nilai itu TIDAK ikut berubah —
  // pilihannya cuma hilang dari dropdown untuk lead berikutnya.
  async function deleteRow(table: ManagedTable, id: string) {
    setError(null);
    const { error: deleteError } = await supabase.from(table).delete().eq("id", id);
    if (deleteError) setError(deleteError.message);
    else await reload();
  }

  async function handleAddBusiness() {
    const name = newBusiness.trim();
    if (name && (await insertRow("business_units", { name }))) setNewBusiness("");
  }

  async function handleAddProduct() {
    const name = newProduct.trim();
    if (!name) return;
    const ok = await insertRow("lead_products", {
      name,
      business_unit_id: newProductBusiness || null,
    });
    if (ok) setNewProduct("");
  }

  async function handleAddSource() {
    const name = newSource.trim();
    if (name && (await insertRow("lead_sources", { name }))) setNewSource("");
  }

  async function handleAddCustomField() {
    const label = newFieldLabel.trim();
    const options = parseOptions(newFieldOptions);
    if (!label) return;
    if (newFieldType === "select" && options.length === 0) {
      setError("Add at least one choice for a dropdown field.");
      return;
    }
    const ok = await insertRow("lead_custom_fields", {
      label,
      field_type: newFieldType,
      options: newFieldType === "select" ? options : [],
      business_unit_id: newFieldBusiness || null,
    });
    if (ok) {
      setNewFieldLabel("");
      setNewFieldOptions("");
    }
  }

  const businessSelect = (value: string, onChange: (v: string) => void) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={inputClass}
    >
      <option value="">All businesses</option>
      {businessUnits.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </select>
  );

  return (
    <section className="flex flex-col gap-3">
      <h2 className="card-title">Lead fields</h2>
      <p className="text-xs text-[var(--color-muted)]">
        Choose what your team can pick when filling in a lead. Removing an
        item only takes it out of the dropdowns — leads that already use it
        keep their value.
      </p>
      {error && <p className="text-[var(--color-danger)] text-sm">{error}</p>}

      <SubSection
        title="Businesses"
        hint="Which part of the company a lead is for, e.g. TransTRACK or TransTRACK Academy."
      >
        <div className="flex flex-wrap gap-2">
          <input
            value={newBusiness}
            onChange={(e) => setNewBusiness(e.target.value)}
            placeholder="Business name"
            className={`${inputClass} flex-1 min-w-40`}
          />
          <button
            type="button"
            onClick={handleAddBusiness}
            disabled={!newBusiness.trim()}
            className={addButtonClass}
          >
            Add
          </button>
        </div>
        <ItemList
          items={businessUnits.map((b) => ({ id: b.id, title: b.name }))}
          onDelete={(id) => deleteRow("business_units", id)}
        />
      </SubSection>

      <SubSection
        title="Products"
        hint="Link a product to a business so it only appears for that business's leads."
      >
        <div className="flex flex-wrap gap-2">
          <input
            value={newProduct}
            onChange={(e) => setNewProduct(e.target.value)}
            placeholder="Product name"
            className={`${inputClass} flex-1 min-w-40`}
          />
          {businessSelect(newProductBusiness, setNewProductBusiness)}
          <button
            type="button"
            onClick={handleAddProduct}
            disabled={!newProduct.trim()}
            className={addButtonClass}
          >
            Add
          </button>
        </div>
        <ItemList
          items={products.map((p) => ({
            id: p.id,
            title: p.name,
            detail: businessName(businessUnits, p.business_unit_id),
          }))}
          onDelete={(id) => deleteRow("lead_products", id)}
        />
      </SubSection>

      <SubSection title="Sources" hint="Where a lead came from.">
        <div className="flex flex-wrap gap-2">
          <input
            value={newSource}
            onChange={(e) => setNewSource(e.target.value)}
            placeholder="Source name"
            className={`${inputClass} flex-1 min-w-40`}
          />
          <button
            type="button"
            onClick={handleAddSource}
            disabled={!newSource.trim()}
            className={addButtonClass}
          >
            Add
          </button>
        </div>
        <ItemList
          items={sources.map((s) => ({ id: s.id, title: s.name }))}
          onDelete={(id) => deleteRow("lead_sources", id)}
        />
      </SubSection>

      <SubSection
        title="Custom fields"
        hint="Extra customer details shown on every lead form. Limit a field to one business if it only matters there."
      >
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <input
              value={newFieldLabel}
              onChange={(e) => setNewFieldLabel(e.target.value)}
              placeholder="Field name (e.g. Fleet size)"
              className={`${inputClass} flex-1 min-w-40`}
            />
            <select
              value={newFieldType}
              onChange={(e) => setNewFieldType(e.target.value as CustomFieldType)}
              className={inputClass}
            >
              {(Object.keys(FIELD_TYPE_LABELS) as CustomFieldType[]).map((t) => (
                <option key={t} value={t}>
                  {FIELD_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            {businessSelect(newFieldBusiness, setNewFieldBusiness)}
          </div>
          {newFieldType === "select" && (
            <textarea
              value={newFieldOptions}
              onChange={(e) => setNewFieldOptions(e.target.value)}
              placeholder={"Choices, one per line\ne.g.\n1–10 vehicles\n11–50 vehicles\n50+ vehicles"}
              rows={4}
              className={inputClass}
            />
          )}
          <button
            type="button"
            onClick={handleAddCustomField}
            disabled={!newFieldLabel.trim()}
            className={`${addButtonClass} self-start`}
          >
            Add field
          </button>
        </div>
        <ItemList
          items={customFields.map((f) => ({
            id: f.id,
            title: f.label,
            detail: [
              FIELD_TYPE_LABELS[f.field_type],
              businessName(businessUnits, f.business_unit_id),
              f.field_type === "select" ? f.options.join(", ") : "",
            ]
              .filter(Boolean)
              .join(" · "),
          }))}
          onDelete={(id) => deleteRow("lead_custom_fields", id)}
        />
      </SubSection>
    </section>
  );
}

function SubSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 border border-[var(--color-border)] rounded-lg p-3">
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-xs text-[var(--color-muted)]">{hint}</p>
      </div>
      {children}
    </div>
  );
}

// Daftar item yang sudah ada, masing-masing dengan tombol Remove.
function ItemList({
  items,
  onDelete,
}: {
  items: { id: string; title: string; detail?: string }[];
  onDelete: (id: string) => void;
}) {
  if (items.length === 0) {
    return <p className="text-xs text-[var(--color-muted)]">Nothing added yet.</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-[var(--color-border)]">
      {items.map((item) => (
        <li
          key={item.id}
          className="py-2 text-sm flex items-start justify-between gap-3"
        >
          <div className="min-w-0">
            <span className="block">{item.title}</span>
            {item.detail && (
              <span className="text-xs text-[var(--color-muted)] break-words">
                {item.detail}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => onDelete(item.id)}
            className="text-xs text-[var(--color-danger)] hover:underline shrink-0"
          >
            Remove
          </button>
        </li>
      ))}
    </ul>
  );
}
