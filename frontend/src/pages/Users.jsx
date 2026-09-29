import { useEffect, useState } from "react";
import api from "../api/client";
import { Card, Table, Button, Modal, Input, Select, Field, Badge } from "../components/ui";

const ROLES = ["super_admin", "admin", "pharmacist", "cashier",
               "inventory_manager", "accountant", "manager"];

export default function Users() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "cashier", is_active: true });

  const load = () => api.get("/auth/users").then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", email: "", password: "", role: "cashier", is_active: true });
    setError(""); setOpen(true);
  };

  const openEdit = (r) => {
    setEditing(r);
    setForm({ name: r.name, email: r.email, password: "", role: r.role, is_active: r.is_active });
    setError(""); setOpen(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const payload = { ...form };
      if (!payload.password) delete payload.password;
      if (editing) await api.put(`/auth/users/${editing.id}`, payload);
      else await api.post("/auth/users", payload);
      setOpen(false); load();
    } catch (e) {
      setError(e.response?.data?.message || "Save failed");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold">Users & Roles</h1>
        <Button onClick={openCreate}>+ New User</Button>
      </div>

      <Card>
        <Table rows={rows} columns={[
          { key: "name", label: "Name" },
          { key: "email", label: "Email" },
          { key: "role", label: "Role", render: (r) => (
            <Badge tone={r.role === "super_admin" ? "red" : r.role === "admin" ? "amber" : "blue"}>
              {r.role}
            </Badge>
          )},
          { key: "is_active", label: "Status", render: (r) => (
            <Badge tone={r.is_active ? "green" : "slate"}>{r.is_active ? "Active" : "Disabled"}</Badge>
          )},
          { key: "_a", label: "", render: (r) => (
            <button onClick={() => openEdit(r)} className="text-blue-600 text-xs font-semibold">Edit</button>
          )},
        ]} />
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit User" : "New User"}>
        <form onSubmit={save} className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Field label="Full Name">
              <Input value={form.name} required onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
          </div>
          <Field label="Email">
            <Input type="email" value={form.email} required
                   onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label={editing ? "New Password (optional)" : "Password"}>
            <Input type="password" value={form.password} required={!editing}
                   onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
          <div className="col-span-2">
            <Field label="Role">
              <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {ROLES.map((r) => <option key={r}>{r}</option>)}
              </Select>
            </Field>
          </div>
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_active}
                   onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            Active
          </label>
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