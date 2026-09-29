import CrudPage from "../components/CrudPage";

export default function Customers() {
  return (
    <CrudPage
      title="Customers"
      endpoint="/customers"
      searchPlaceholder="Search customer / phone..."
      columns={[
        { key: "name", label: "Name" },
        { key: "phone", label: "Phone" },
        { key: "age", label: "Age" },
        { key: "gender", label: "Gender" },
        { key: "customer_type", label: "Type" },
        { key: "doctor_name", label: "Doctor" },
        { key: "credit_limit", label: "Credit Limit" },
      ]}
      fields={[
        { name: "name", label: "Name", required: true },
        { name: "phone", label: "Phone" },
        { name: "email", label: "Email" },
        { name: "age", label: "Age", type: "number" },
        {
          name: "gender", label: "Gender", type: "select",
          options: [{ value: "Male", label: "Male" }, { value: "Female", label: "Female" },
                    { value: "Other", label: "Other" }],
        },
        {
          name: "customer_type", label: "Customer Type", type: "select",
          default: "retail",
          options: ["retail", "wholesale", "hospital", "corporate", "vip", "distributor"]
            .map((v) => ({ value: v, label: v })),
        },
        { name: "doctor_name", label: "Referring Doctor" },
        { name: "credit_limit", label: "Credit Limit", type: "number" },
        { name: "address", label: "Address", type: "textarea", full: true },
      ]}
    />
  );
}