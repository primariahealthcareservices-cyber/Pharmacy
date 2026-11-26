import { useEffect, useState } from "react";
import api from "../api/client";
import { Card, Modal, Button, Input, Select, Field, Table } from "./ui";

/**
 * New optional props:
 *   params   – extra query params sent on every list call, e.g. { type: "online" }
 *   headerExtra – node rendered next to the "+ New" button / above the table (e.g. tabs)
 */
export default function CrudPage({
  title, endpoint, columns, fields, searchPlaceholder,
  params = {}, headerExtra = null, singular,
}) {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const paramsKey = JSON.stringify(params);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(endpoint, { params: { ...params, q } });
      setRows(data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [q, paramsKey]);

  const openCreate = () => {
    setEditing(null);
    setForm(Object.fromEntries(fields.map((f) => [f.name, f.default ?? ""])));
    setError("");
    setOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm(Object.fromEntries(fields.map((f) => [f.name, row[f.name] ?? f.default ?? ""])));
    setError("");
    setOpen(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const payload = { ...form };
      fields.forEach((f) => {
        if (f.type === "number" && payload[f.name] !== "") payload[f.name] = Number(payload[f.name]);
      });
      if (editing) await api.put(`${endpoint}/${editing.id}`, payload);
      else await api.post(endpoint, payload);
      setOpen(false);
      load();
    } catch (err) {
      setError(err.response?.data?.message || "Save failed");
    }
  };

  const remove = async (row) => {
    if (!confirm(`Delete "${row.name}"?`)) return;
    await api.delete(`${endpoint}/${row.id}`);
    load();
  };

  const allColumns = [
    ...columns,
    {
      key: "_actions",
      label: "",
      render: (r) => (
        <div className="flex gap-2 justify-end">
          <button onClick={() => openEdit(r)} className="text-blue-600 text-xs font-semibold">Edit</button>
          <button onClick={() => remove(r)} className="text-red-600 text-xs font-semibold">Delete</button>
        </div>
      ),
    },
  ];

  // fields can hide themselves depending on the current form values
  const visibleFields = fields.filter((f) => !f.showIf || f.showIf(form));
  const noun = singular || title.slice(0, -1);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold">{title}</h1>
        <Button onClick={openCreate}>+ New</Button>
      </div>

      {headerExtra}

      <Card>
        <div className="mb-3">
          <Input placeholder={searchPlaceholder || "Search..."} value={q}
                 onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
        </div>
        <Table columns={allColumns} rows={rows} empty={loading ? "Loading..." : "No records found"} />
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={`${editing ? "Edit" : "New"} ${noun}`} wide>
        <form onSubmit={save} className="grid grid-cols-2 gap-4">
          {visibleFields.map((f) => (
            <div key={f.name} className={f.full ? "col-span-2" : ""}>
              <Field label={f.label}>
                {f.type === "select" ? (
                  <Select value={form[f.name] ?? ""} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}>
                    {!f.noEmpty && <option value="">— Select —</option>}
                    {f.options.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </Select>
                ) : f.type === "textarea" ? (
                  <textarea rows="3" className="input"
                            value={form[f.name] ?? ""}
                            onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} />
                ) : (
                  <Input type={f.type || "text"} value={form[f.name] ?? ""}
                         onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                         required={typeof f.required === "function" ? f.required(form) : f.required} />
                )}
              </Field>
            </div>
          ))}

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