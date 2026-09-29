import CrudPage from "../components/CrudPage";

export default function Manufacturers() {
  return (
    <CrudPage
      title="Manufacturers"
      endpoint="/manufacturers"
      searchPlaceholder="Search manufacturer..."
      columns={[
        { key: "name", label: "Name" },
        { key: "code", label: "Code" },
        { key: "contact_person", label: "Contact" },
        { key: "phone", label: "Phone" },
        { key: "gst_number", label: "GST" },
        { key: "payment_terms", label: "Terms" },
        { key: "medicine_count", label: "Products" },
      ]}
      fields={[
        { name: "name", label: "Manufacturer Name", required: true },
        { name: "code", label: "Company Code" },
        { name: "contact_person", label: "Contact Person" },
        { name: "phone", label: "Phone" },
        { name: "email", label: "Email" },
        { name: "gst_number", label: "GST Number" },
        { name: "drug_license", label: "Drug License" },
        { name: "payment_terms", label: "Payment Terms" },
        { name: "credit_limit", label: "Credit Limit", type: "number" },
        { name: "address", label: "Address", type: "textarea", full: true },
        { name: "bank_details", label: "Bank Details", type: "textarea", full: true },
      ]}
    />
  );
}