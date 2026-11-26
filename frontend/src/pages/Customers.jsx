import { useEffect, useMemo, useState } from "react";
import api from "../api/client";
import { Card, Modal, Button, Input, Select, Field, Table, Badge } from "../components/ui";

// "retail" / empty (old rows) count as walk-in
const normType = (t) =>
  String(t || "").toLowerCase().replace(/[\s-]/g, "_") === "online" ? "online" : "walk_in";

const TABS = [
  { value: "walk_in", label: "Walk-in" },
  { value: "online", label: "Online" },
];

const emptyForm = (type) => ({
  customer_type: type,
  name: "", phone: "", email: "", age: "", gender: "", doctor_name: "", address: "",
});

export default function Customers() {
  const [tab, setTab] = useState("walk_in");
  const [all, setAll] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm("walk_in"));
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/customers");
      setAll(Array.isArray(data) ? data : []);
    } catch {
      setAll([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  // type + search (case-insensitive) – done here so it works whatever the API returns
  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return all.filter((c) =>
      normType(c.customer_type) === tab &&
      (!ql ||
        (c.name || "").toLowerCase().includes(ql) ||
        (c.phone || "").toLowerCase().includes(ql))
    );
  }, [all, tab, q]);

  const count = (t) => all.filter((c) => normType(c.customer_type) === t).length;

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm(tab));          // new customer starts as the selected tab's type
    setError("");
    setOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      customer_type: normType(row.customer_type),
      name: row.name ?? "", phone: row.phone ?? "", email: row.email ?? "",
      age: row.age ?? "", gender: row.gender ?? "",
      doctor_name: row.doctor_name ?? "", address: row.address ?? "",
    });
    setError("");
    setOpen(true);
  };

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.name.trim()) return setError("Name is required");
    if (form.customer_type === "online" && !form.phone.trim())
      return setError("Phone is required for online customers");

    const payload = { ...form, age: form.age === "" ? null : Number(form.age) };
    try {
      if (editing) await api.put(`/customers/${editing.id}`, payload);
      else await api.post("/customers", payload);
      setOpen(false);
      setTab(form.customer_type);     // jump to the tab the customer was saved in
      load();
    } catch (err) {
      setError(err.response?.data?.message || "Save failed");
    }
  };

  const remove = async (row) => {
    if (!confirm(`Delete "${row.name}"?`)) return;
    try {
      await api.delete(`/customers/${row.id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.message || "Delete failed");
    }
  };

  const columns = [
    {
      key: "customer_type", label: "Type",
      render: (r) => normType(r.customer_type) === "online"
        ? <Badge tone="blue">Online</Badge>
        : <Badge tone="green">Walk-in</Badge>,
    },
    { key: "name", label: "Name" },
    { key: "phone", label: "Phone" },
    { key: "age", label: "Age" },
    { key: "gender", label: "Gender" },
    { key: "doctor_name", label: "Doctor" },
    {
      key: "address", label: "Address",
      render: (r) => r.address
        ? (r.address.length > 40 ? r.address.slice(0, 40) + "…" : r.address)
        : "—",
    },
    {
      key: "_actions", label: "",
      render: (r) => (
        <div className="flex gap-2 justify-end">
          <button onClick={() => openEdit(r)} className="text-blue-600 text-xs font-semibold">Edit</button>
          <button onClick={() => remove(r)} className="text-red-600 text-xs font-semibold">Delete</button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold">Customers</h1>
        <Button onClick={openCreate}>+ New {tab === "online" ? "Online" : "Walk-in"} Customer</Button>
      </div>

      {/* Type buttons */}
      <div className="flex gap-2 mb-4">
        {TABS.map((t) => (
          <button key={t.value} type="button" onClick={() => setTab(t.value)}
                  className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition ${
                    tab === t.value
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"}`}>
            {t.label} ({count(t.value)})
          </button>
        ))}
      </div>

      <Card>
        <div className="mb-3">
          <Input placeholder="Search customer / phone..." value={q}
                 onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
        </div>
        <Table columns={columns} rows={rows}
               empty={loading ? "Loading..." : `No ${tab === "online" ? "online" : "walk-in"} customers found`} />
      </Card>

      <Modal open={open} onClose={() => setOpen(false)}
             title={`${editing ? "Edit" : "New"} Customer`} wide>
        <form onSubmit={save} className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Field label="Customer Type">
              <div className="flex gap-2">
                {TABS.map((t) => (
                  <button key={t.value} type="button" onClick={() => set("customer_type", t.value)}
                          className={`flex-1 py-2 rounded-lg text-sm font-semibold border ${
                            form.customer_type === t.value
                              ? "bg-emerald-600 text-white border-emerald-600"
                              : "bg-white text-slate-600 border-slate-300"}`}>
                    {t.label} Customer
                  </button>
                ))}
              </div>
            </Field>
          </div>

          <Field label="Name *">
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} required />
          </Field>
          <Field label={form.customer_type === "online" ? "Phone *" : "Phone"}>
            <Input value={form.phone} onChange={(e) => set("phone", e.target.value)}
                   required={form.customer_type === "online"} />
          </Field>
          <Field label="Email">
            <Input value={form.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Age">
            <Input type="number" value={form.age} onChange={(e) => set("age", e.target.value)} />
          </Field>
          <Field label="Gender">
            <Select value={form.gender} onChange={(e) => set("gender", e.target.value)}>
              <option value="">— Select —</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </Select>
          </Field>
          <Field label="Referring Doctor">
            <Input value={form.doctor_name} onChange={(e) => set("doctor_name", e.target.value)} />
          </Field>
          <div className="col-span-2">
            <Field label={form.customer_type === "online" ? "Delivery Address" : "Address"}>
              <textarea rows="3" className="input" value={form.address}
                        onChange={(e) => set("address", e.target.value)} />
            </Field>
          </div>

          {error && <p className="col-span-2 text-red-600 text-sm">{error}</p>}

          <div className="col-span-2 flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}