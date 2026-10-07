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
        { key: "doctor_name", label: "Doctor" },
        { key: "address", label: "Address", render: (r) =>
          r.address
            ? (r.address.length > 40 ? r.address.slice(0, 40) + "…" : r.address)
            : "—"
        },
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
        { name: "doctor_name", label: "Referring Doctor" },
        { name: "address", label: "Address", type: "textarea", full: true },
      ]}
    />
  );
}