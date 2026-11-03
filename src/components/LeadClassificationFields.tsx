"use client";

import { Fragment, type ReactNode } from "react";
import SumberSelect from "@/components/SumberSelect";
import {
  customFieldsForBusiness,
  productsForBusiness,
  useLeadFieldSettings,
} from "@/lib/useLeadFieldSettings";
import type { LeadCustomField } from "@/lib/types";

export type LeadClassificationValues = {
  business_unit_id: string;
  produk: string;
  custom_fields: Record<string, string>;
};

// Field "Business", "Product", dan semua field tambahan buatan admin —
// dipakai bareng oleh form tambah lead, halaman detail lead, dan panel lead
// di Inbox. Tiap form punya gaya label sendiri, jadi bungkusnya diserahkan
// ke pemanggil lewat renderField.
export default function LeadClassificationFields({
  values,
  onChange,
  renderField,
  inputClassName,
  idPrefix = "",
}: {
  values: LeadClassificationValues;
  onChange: (patch: Partial<LeadClassificationValues>) => void;
  renderField: (label: string, htmlFor: string, control: ReactNode) => ReactNode;
  inputClassName: string;
  idPrefix?: string;
}) {
  const { businessUnits, products, customFields } = useLeadFieldSettings();
  const productOptions = productsForBusiness(products, values.business_unit_id);
  const visibleCustomFields = customFieldsForBusiness(
    customFields,
    values.business_unit_id,
  );

  // Ganti business: kalau produk yang sedang dipilih adalah produk milik
  // business lain, kosongkan — supaya tidak tersimpan produk Academy di
  // lead TransTRACK (atau sebaliknya). Produk umum / ketikan bebas dibiarkan.
  function handleBusinessChange(businessUnitId: string) {
    const stillValid =
      !values.produk ||
      productsForBusiness(products, businessUnitId).includes(values.produk) ||
      !products.some((p) => p.name === values.produk);
    onChange({
      business_unit_id: businessUnitId,
      produk: stillValid ? values.produk : "",
    });
  }

  function setCustomValue(fieldId: string, value: string) {
    onChange({ custom_fields: { ...values.custom_fields, [fieldId]: value } });
  }

  return (
    <>
      {businessUnits.length > 0 &&
        renderField(
          "Business",
          `${idPrefix}business_unit_id`,
          <select
            id={`${idPrefix}business_unit_id`}
            value={values.business_unit_id}
            onChange={(e) => handleBusinessChange(e.target.value)}
            className={inputClassName}
          >
            <option value="">- Select business -</option>
            {businessUnits.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>,
        )}

      {renderField(
        "Product/need of interest",
        `${idPrefix}produk`,
        <SumberSelect
          id={`${idPrefix}produk`}
          value={values.produk}
          onChange={(produk) => onChange({ produk })}
          options={productOptions}
          emptyLabel="- Select product -"
          customPlaceholder="Type a product or need"
          className={inputClassName}
        />,
      )}

      {visibleCustomFields.map((field) => (
        <Fragment key={field.id}>
          {renderField(
            field.label,
            `${idPrefix}cf-${field.id}`,
            <CustomFieldInput
              id={`${idPrefix}cf-${field.id}`}
              field={field}
              value={values.custom_fields[field.id] ?? ""}
              onChange={(value) => setCustomValue(field.id, value)}
              className={inputClassName}
            />,
          )}
        </Fragment>
      ))}
    </>
  );
}

// Satu input untuk satu field tambahan, bentuknya mengikuti tipe field.
function CustomFieldInput({
  id,
  field,
  value,
  onChange,
  className,
}: {
  id: string;
  field: LeadCustomField;
  value: string;
  onChange: (value: string) => void;
  className: string;
}) {
  if (field.field_type === "select") {
    return (
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className}
      >
        <option value="">-</option>
        {field.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        {/* Nilai lama yang sudah dihapus admin dari daftar tetap tampil. */}
        {value && !field.options.includes(value) && (
          <option value={value}>{value}</option>
        )}
      </select>
    );
  }
  return (
    <input
      id={id}
      type={field.field_type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    />
  );
}
