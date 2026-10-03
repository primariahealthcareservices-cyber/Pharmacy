import { useEffect, useState } from "react";
import api, { money } from "../api/client";
import { Card, Modal, Button, Input, Select, Field, Table, Badge } from "../components/ui";

const EMPTY = {
  name: "", generic_name: "", brand_name: "", category_id: "", manufacturer_id: "",
  medicine_type: "Tablet", dosage_form: "", strength: "", composition: "",
  pack_type: "", hsn_code: "", is_prescription: false,
  base_unit: "tablet", units_per_strip: 10, strips_per_box: 10,
  gst_rate: 12, mrp: 0, cost_price: 0, selling_price: 0,
  wholesale_price: 0, reorder_level: 50, max_level: 500,
  rack_location: "", barcode: "", sku: "", is_active: true,
};

// Whitelist — must match backend FIELDS exactly
const SEND_FIELDS = Object.keys(EMPTY);

const NUMERIC_INT = [
  "units_per_strip", "strips_per_box", "reorder_level", "max_level",
];
const NUMERIC_FLOAT = [
  "gst_rate", "mrp", "cost_price", "selling_price", "wholesale_price",
];
const FK_FIELDS = ["category_id", "manufacturer_id"];

export default function Medicines() {
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [manufacturers, setManufacturers] = useState([]);
  const [q, setQ] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const { data } = await api.get("/medicines", {
        params: { q, low_stock: lowOnly ? 1 : 0 },
      });
      setRows(data);
    } catch (err) {
      console.error("Load medicines failed:", err.response?.data || err.message);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [q, lowOnly]);

  useEffect(() => {
    api.get("/categories").then((r) => setCategories(r.data)).catch(() => {});
    api.get("/manufacturers").then((r) => setManufacturers(r.data)).catch(() => {});
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setError("");
    setOpen(true);
  };

  const openEdit = (r) => {
    const clean = {};
    Object.keys(EMPTY).forEach((k) => {
      clean[k] = r[k] !== undefined && r[k] !== null ? r[k] : EMPTY[k];
    });
    setEditing(r);
    setForm(clean);
    setError("");
    setOpen(true);
  };

  const buildPayload = () => {
    const payload = {};
    SEND_FIELDS.forEach((k) => {
      let v = form[k];

      if (typeof v === "string" && v.trim() === "") v = null;

      if (FK_FIELDS.includes(k)) {
        payload[k] = v === null || v === "" ? null : Number(v) || null;
      } else if (NUMERIC_INT.includes(k)) {
        payload[k] = v === null || v === "" ? 0 : Number(v) || 0;
      } else if (NUMERIC_FLOAT.includes(k)) {
        payload[k] = v === null || v === "" ? 0 : Number(v) || 0;
      } else if (k === "is_prescription" || k === "is_active") {
        payload[k] = Boolean(v);
      } else {
        payload[k] = v === "" ? null : v;
      }
    });
    return payload;
  };

  const save = async (e) => {
    e.preventDefault();
    setError("");
    const payload = buildPayload();

    try {
      if (editing) await api.put(`/medicines/${editing.id}`, payload);
      else await api.post("/medicines", payload);
      setOpen(false);
      load();
    } catch (err) {
      const data = err.response?.data;
      if (data?.errors) {
        setError(
          Object.entries(data.errors)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
            .join(" · ")
        );
      } else {
        setError(data?.message || `Save failed (${err.response?.status || "network"})`);
      }
      console.error("Save error:", data || err.message);
    }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold">Medicines</h1>
        <Button onClick={openCreate}>+ New Medicine</Button>
      </div>

      <Card>
        <div className="flex flex-wrap gap-3 mb-3 items-center">
          <Input placeholder="Search name / generic / SKU / barcode..."
                 value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={lowOnly}
                   onChange={(e) => setLowOnly(e.target.checked)} />
            Low stock only
          </label>
        </div>

        <Table
          rows={rows}
          columns={[
            { key: "name", label: "Medicine", render: (r) => (
              <div>
                <div className="font-semibold">{r.name}</div>
                <div className="text-xs text-slate-400">{r.generic_name || "—"}</div>
              </div>
            )},
            { key: "sku", label: "SKU" },
            { key: "category_name", label: "Category" },
            { key: "manufacturer_name", label: "Manufacturer" },
            { key: "pack", label: "Pack", render: (r) =>
              `${r.units_per_strip} ${r.base_unit}/strip · ${r.strips_per_box} strip/box` },
            { key: "stock", label: "Stock", render: (r) => (
              <Badge tone={r.low_stock ? "red" : "green"}>
                {r.stock} {r.base_unit}{r.stock === 1 ? "" : "s"}
              </Badge>
            )},
            { key: "mrp", label: "MRP/unit", render: (r) => money(r.mrp) },
            { key: "selling_price", label: "Sell/unit", render: (r) => money(r.selling_price) },
            { key: "_a", label: "", render: (r) => (
              <button onClick={() => openEdit(r)}
                      className="text-blue-600 text-xs font-semibold">Edit</button>
            )},
          ]}
        />
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} wide
             title={editing ? "Edit Medicine" : "New Medicine"}>
        <form onSubmit={save} className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <Field label="Medicine Name *">
              <Input value={form.name} onChange={set("name")} required />
            </Field>
          </div>
          <Field label="SKU"><Input value={form.sku} onChange={set("sku")} placeholder="auto" /></Field>

          <Field label="Generic Name"><Input value={form.generic_name} onChange={set("generic_name")} /></Field>
          <Field label="Brand"><Input value={form.brand_name} onChange={set("brand_name")} /></Field>
          <Field label="Barcode"><Input value={form.barcode} onChange={set("barcode")} /></Field>

          <Field label="Category">
            <Select value={form.category_id} onChange={set("category_id")}>
              <option value="">—</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Manufacturer">
            <Select value={form.manufacturer_id} onChange={set("manufacturer_id")}>
              <option value="">—</option>
              {manufacturers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </Field>
          <Field label="Type">
            <Select value={form.medicine_type} onChange={set("medicine_type")}>
              {["Tablet", "Capsule", "Syrup", "Injection", "Ointment", "Drops", "Powder", "Inhaler"]
                .map((t) => <option key={t}>{t}</option>)}
            </Select>
          </Field>

          <Field label="Strength"><Input value={form.strength} onChange={set("strength")} placeholder="500mg" /></Field>
          <Field label="Dosage Form"><Input value={form.dosage_form} onChange={set("dosage_form")} /></Field>
          <Field label="Pack Type"><Input value={form.pack_type} onChange={set("pack_type")} /></Field>

          <Field label="Composition">
            <Input value={form.composition} onChange={set("composition")} />
          </Field>
          <Field label="HSN Code"><Input value={form.hsn_code} onChange={set("hsn_code")} /></Field>
          <Field label="Rack Location"><Input value={form.rack_location} onChange={set("rack_location")} /></Field>

          <div className="col-span-3 border-t pt-3 mt-1">
            <p className="text-xs font-bold uppercase text-emerald-700 mb-2">Packaging Hierarchy</p>
          </div>

          <Field label="Base Unit">
            <Select value={form.base_unit} onChange={set("base_unit")}>
              {["tablet", "capsule", "ml", "unit", "packet", "gram"].map((u) =>
                <option key={u}>{u}</option>)}
            </Select>
          </Field>
          <Field label="Units per Strip">
            <Input type="number" value={form.units_per_strip} onChange={set("units_per_strip")} />
          </Field>
          <Field label="Strips per Box">
            <Input type="number" value={form.strips_per_box} onChange={set("strips_per_box")} />
          </Field>

          <div className="col-span-3 border-t pt-3 mt-1">
            <p className="text-xs font-bold uppercase text-emerald-700 mb-2">
              Pricing (per {form.base_unit})
            </p>
          </div>

          <Field label="GST %"><Input type="number" value={form.gst_rate} onChange={set("gst_rate")} /></Field>
          <Field label="MRP"><Input type="number" step="0.01" value={form.mrp} onChange={set("mrp")} /></Field>
          <Field label="Cost Price"><Input type="number" step="0.01" value={form.cost_price} onChange={set("cost_price")} /></Field>
          <Field label="Selling Price"><Input type="number" step="0.01" value={form.selling_price} onChange={set("selling_price")} /></Field>
          <Field label="Wholesale Price"><Input type="number" step="0.01" value={form.wholesale_price} onChange={set("wholesale_price")} /></Field>
          <Field label="Reorder Level"><Input type="number" value={form.reorder_level} onChange={set("reorder_level")} /></Field>

          <label className="col-span-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_prescription}
                   onChange={(e) => setForm({ ...form, is_prescription: e.target.checked })} />
            Prescription required
          </label>

          {error && <p className="col-span-3 text-red-600 text-sm">{error}</p>}

          <div className="col-span-3 flex justify-end gap-3 pt-3 border-t">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit">Save Medicine</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}