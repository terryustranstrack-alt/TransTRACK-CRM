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

// Field "Product" dan semua field tambahan buatan admin — dipakai bareng
// oleh form tambah lead, halaman detail lead, dan panel lead di Inbox.
// Pilihannya mengikuti business yang dipilih (values.business_unit_id).
// Business sendiri dipilih lewat BusinessPicker yang ditaruh paling atas
// tiap form. Tiap form punya gaya label sendiri, jadi bungkusnya diserahkan
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
  const { products, customFields } = useLeadFieldSettings();
  const productOptions = productsForBusiness(products, values.business_unit_id);
  const visibleCustomFields = customFieldsForBusiness(
    customFields,
    values.business_unit_id,
  );

  function setCustomValue(fieldId: string, value: string) {
    onChange({ custom_fields: { ...values.custom_fields, [fieldId]: value } });
  }

  return (
    <>
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
