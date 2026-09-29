import CrudPage from "../components/CrudPage";

export default function Vendors() {
  return (
    <CrudPage
      title="Vendors"
      endpoint="/vendors"
      searchPlaceholder="Search vendor..."
      columns={[
        { key: "name", label: "Vendor" },
        { key: "contact_person", label: "Contact" },
        { key: "phone", label: "Phone" },
        { key: "gst_number", label: "GST" },
        { key: "payment_terms", label: "Terms" },
        { key: "credit_days", label: "Credit Days" },
        { key: "opening_balance", label: "Opening Bal" },
      ]}
      fields={[
        { name: "name", label: "Vendor Name", required: true },
        { name: "contact_person", label: "Contact Person" },
        { name: "phone", label: "Phone" },
        { name: "email", label: "Email" },
        { name: "gst_number", label: "GST Number" },
        { name: "license_number", label: "License Number" },
        { name: "payment_terms", label: "Payment Terms" },
        { name: "credit_days", label: "Credit Days", type: "number" },
        { name: "opening_balance", label: "Opening Balance", type: "number" },
        { name: "credit_limit", label: "Credit Limit", type: "number" },
        { name: "address", label: "Address", type: "textarea", full: true },
      ]}
    />
  );
}