import { useEffect, useState } from "react";
import api, { money, todayISO } from "../api/client";
import { Card, Table, Button, Input, Select, Field, Modal, Badge, Stat } from "../components/ui";

export default function Expenses() {
  const [rows, setRows] = useState([]);
  const [cats, setCats] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    category_id: "", amount: "", expense_date: todayISO(),
    payment_mode: "cash", description: "", reference: "",
  });

  const load = () => api.get("/expenses").then((r) => setRows(r.data));

  useEffect(() => {
    load();
    api.get("/expense-categories").then((r) => setCats(r.data));
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ category_id: "", amount: "", expense_date: todayISO(),
              payment_mode: "cash", description: "", reference: "" });
    setError(""); setOpen(true);
  };

  const openEdit = (r) => {
    setEditing(r);
    setForm({ ...r, category_id: r.category_id || "" });
    setError(""); setOpen(true);
  };

  const save = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        category_id: form.category_id ? Number(form.category_id) : null,
        amount: Number(form.amount) || 0,
      };
      if (editing) await api.put(`/expenses/${editing.id}`, payload);
      else await api.post("/expenses", payload);
      setOpen(false); load();
    } catch (e) {
      setError(e.response?.data?.message || "Save failed");
    }
  };

  const remove = async (r) => {
    if (!confirm("Delete this expense?")) return;
    await api.delete(`/expenses/${r.id}`); load();
  };

  const total = rows.reduce((s, r) => s + (r.amount || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold">Expenses</h1>
        <Button onClick={openCreate}>+ New Expense</Button>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-4">
        <Stat label="Total Expenses (listed)" value={money(total)} tone="red" />
        <Stat label="Entries" value={rows.length} tone="slate" />
        <Stat label="Categories" value={cats.length} tone="blue" />
        <Stat label="Avg / Entry" value={money(rows.length ? total / rows.length : 0)} tone="amber" />
      </div>

      <Card>
        <Table
          rows={rows}
          columns={[
            { key: "expense_date", label: "Date" },
            { key: "category_name", label: "Category", render: (r) => (
              <Badge tone="blue">{r.category_name || "—"}</Badge>
            )},
            { key: "description", label: "Description" },
            { key: "payment_mode", label: "Mode" },
            { key: "reference", label: "Ref" },
            { key: "amount", label: "Amount", render: (r) => (
              <span className="font-semibold text-red-600">{money(r.amount)}</span>
            )},
            { key: "_a", label: "", render: (r) => (
              <div className="flex gap-2 justify-end">
                <button onClick={() => openEdit(r)} className="text-blue-600 text-xs font-semibold">Edit</button>
                <button onClick={() => remove(r)} className="text-red-600 text-xs font-semibold">Delete</button>
              </div>
            )},
          ]}
        />
      </Card>

      <Modal open={open} onClose={() => setOpen(false)}
             title={editing ? "Edit Expense" : "New Expense"}>
        <form onSubmit={save} className="grid grid-cols-2 gap-4">
          <Field label="Category">
            <Select value={form.category_id}
                    onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
              <option value="">—</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Amount">
            <Input type="number" step="0.01" value={form.amount} required
                   onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </Field>
          <Field label="Date">
            <Input type="date" value={form.expense_date}
                   onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
          </Field>
          <Field label="Payment Mode">
            <Select value={form.payment_mode}
                    onChange={(e) => setForm({ ...form, payment_mode: e.target.value })}>
              {["cash", "upi", "card", "bank", "cheque"].map((m) => <option key={m}>{m}</option>)}
            </Select>
          </Field>
          <div className="col-span-2">
            <Field label="Description">
              <Input value={form.description}
                     onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Reference">
              <Input value={form.reference}
                     onChange={(e) => setForm({ ...form, reference: e.target.value })} />
            </Field>
          </div>
          {error && <p className="col-span-2 text-red-600 text-sm">{error}</p>}
          <div className="col-span-2 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}