import { useEffect, useState } from "react";
import api, { money } from "../api/client";
import { Card, Modal, Button, Input, Select, Field, Table, Badge } from "../components/ui";

const EMPTY = {
  name: "", generic_name: "", brand_name: "", category_id: "", manufacturer_id: "",
  medicine_type: "Tablet", dosage_form: "", strength: "", composition: "",
  pack_type: "", description: "", hsn_code: "", is_prescription: false,

  // Base unit + defaults for stock conversion
  base_unit: "tablet",
  units_per_strip: 10,
  strips_per_box: 10,

  gst_rate: 12, mrp: 0, cost_price: 0, selling_price: 0,
  wholesale_price: 0, min_selling_price: 0,
  reorder_level: 50, max_level: 500,
  rack_location: "", barcode: "", sku: "", is_active: true,

  // stock entry
  init_qty: 0,
  init_entry_unit: "tablet",   // tablet | strip | box
  init_batch_no: "",
  init_mfg_date: "",
  init_exp_date: "",
  init_cost_price: 0,
  init_mrp: 0,
  init_selling_price: 0,
};

const SEND_FIELDS = Object.keys(EMPTY).filter((k) => !k.startsWith("init_"));
const NUMERIC_INT = ["units_per_strip", "strips_per_box", "reorder_level", "max_level"];
const NUMERIC_FLOAT = [
  "gst_rate", "mrp", "cost_price", "selling_price",
  "wholesale_price", "min_selling_price",
];
const FK_FIELDS = ["category_id", "manufacturer_id"];

// plural helper — "tablet" → "tablets", "ml" stays "ml"
const plural = (unit, n) => {
  if (unit === "ml") return unit;
  return n === 1 ? unit : `${unit}s`;
};

// Convert entry (tablet/strip/box) into base units
function toBaseQty(entryQty, entryUnit, ups, spb) {
  const q = Math.floor(Number(entryQty)) || 0;
  const u = Math.max(1, Math.floor(Number(ups)) || 1);
  const s = Math.max(1, Math.floor(Number(spb)) || 1);
  if (q <= 0) return 0;
  if (entryUnit === "box") return q * s * u;
  if (entryUnit === "strip") return q * u;
  return q;
}

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
  const [editBatchId, setEditBatchId] = useState(null);
  const [otherBatches, setOtherBatches] = useState([]);
  const [addedCount, setAddedCount] = useState(0);

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
    setEditBatchId(null);
    setOtherBatches([]);
    setForm(EMPTY);
    setError("");
    setAddedCount(0);
    setOpen(true);
  };

  const openEdit = async (r) => {
    const clean = {};
    Object.keys(EMPTY).forEach((k) => {
      if (k.startsWith("init_")) clean[k] = EMPTY[k];
      else clean[k] = r[k] !== undefined && r[k] !== null ? r[k] : EMPTY[k];
    });
    if (clean.base_unit === "box" || clean.base_unit === "strip") {
      clean.base_unit = "tablet";
    }
    setEditing(r);
    setForm(clean);
    setError("");
    setEditBatchId(null);
    setOtherBatches([]);
    setAddedCount(0);
    setOpen(true);

    try {
      const { data } = await api.get(`/medicines/${r.id}/batches`);
      if (data.length > 0) {
        const primary = data[0];
        setEditBatchId(primary.id);
        setOtherBatches(data.slice(1));
        const hasEntry = !!primary.entry_qty;
        setForm((prev) => ({
          ...prev,
          init_qty: hasEntry ? primary.entry_qty : primary.qty || 0,
          init_entry_unit: hasEntry ? primary.entry_unit || "tablet" : "tablet",
          init_batch_no: primary.batch_no || "",
          init_mfg_date: primary.mfg_date || "",
          init_exp_date: primary.exp_date || "",
          init_cost_price: primary.cost_price ?? 0,
          init_mrp: primary.mrp ?? 0,
          init_selling_price: primary.selling_price ?? 0,
        }));
      }
    } catch { /* no batches */ }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const buildPayload = () => {
    const payload = {};
    SEND_FIELDS.forEach((k) => {
      let v = form[k];
      if (typeof v === "string" && v.trim() === "") v = null;
      if (FK_FIELDS.includes(k)) {
        payload[k] = v === null || v === "" ? null : Number(v) || null;
      } else if (k === "units_per_strip" || k === "strips_per_box") {
        payload[k] = Math.max(1, Math.floor(Number(v)) || 1);
      } else if (NUMERIC_INT.includes(k) || NUMERIC_FLOAT.includes(k)) {
        payload[k] = v === null || v === "" ? 0 : Number(v) || 0;
      } else if (k === "is_prescription" || k === "is_active") {
        payload[k] = Boolean(v);
      } else {
        payload[k] = v === "" ? null : v;
      }
    });
    return payload;
  };

  const buildBatchPayload = () => ({
    batch_no: form.init_batch_no?.trim() || "OPENING",
    entry_qty: Math.floor(Number(form.init_qty)) || 0,
    entry_unit: form.init_entry_unit || "tablet",
    mfg_date: form.init_mfg_date || null,
    exp_date: form.init_exp_date || null,
    cost_price: Number(form.init_cost_price) || Number(form.cost_price) || 0,
    mrp: Number(form.init_mrp) || Number(form.mrp) || 0,
    selling_price: Number(form.init_selling_price) || Number(form.selling_price) || 0,
    gst_rate: Number(form.gst_rate) || 12,
  });

  const validateStock = () => {
    const upsVal = Math.max(1, Math.floor(Number(form.units_per_strip)) || 1);
    const spbVal = Math.max(1, Math.floor(Number(form.strips_per_box)) || 1);
    const qtyVal = Math.floor(Number(form.init_qty)) || 0;

    if (qtyVal < 0) { setError("Quantity cannot be negative."); return null; }
    if (form.init_entry_unit !== "tablet" && qtyVal > 0 && upsVal < 1) {
      setError(`${plural(form.base_unit, 2)} per Strip must be at least 1.`);
      return null;
    }
    if (form.init_entry_unit === "box" && qtyVal > 0 && spbVal < 1) {
      setError("Strips per Box must be at least 1.");
      return null;
    }
    return qtyVal;
  };

  const save = async (e) => {
    e.preventDefault();
    setError("");

    const qtyVal = validateStock();
    if (qtyVal === null) return;

    try {
      if (editing) {
        await api.put(`/medicines/${editing.id}`, buildPayload());
        if (editBatchId) {
          await api.put(
            `/medicines/${editing.id}/batches/${editBatchId}`,
            buildBatchPayload()
          );
        } else if (qtyVal > 0) {
          await api.post(`/medicines/${editing.id}/batches`, buildBatchPayload());
        }
      } else {
        const payload = buildPayload();
        if (qtyVal > 0) {
          payload.initial_batch = buildBatchPayload();
        }
        await api.post("/medicines", payload);
      }
      setOpen(false);
      load();
    } catch (err) {
      const data = err.response?.data;
      setError(data?.message || `Save failed (${err.response?.status || "network"})`);
    }
  };

  // Save current medicine, then keep the modal open with
  // manufacturer / category / packaging defaults preserved
  const saveAndAddAnother = async (e) => {
    e.preventDefault();
    setError("");

    const qtyVal = validateStock();
    if (qtyVal === null) return;

    try {
      const payload = buildPayload();
      if (qtyVal > 0) {
        payload.initial_batch = buildBatchPayload();
      }
      await api.post("/medicines", payload);

      setAddedCount((c) => c + 1);

      // Keep manufacturer + category + type + packaging defaults;
      // clear name, prices, stock, batch, etc.
      setForm({
        ...EMPTY,
        manufacturer_id: form.manufacturer_id,
        category_id: form.category_id,
        medicine_type: form.medicine_type,
        base_unit: form.base_unit,
        units_per_strip: form.units_per_strip,
        strips_per_box: form.strips_per_box,
        gst_rate: form.gst_rate,
      });

      load();
    } catch (err) {
      const data = err.response?.data;
      setError(data?.message || `Save failed (${err.response?.status || "network"})`);
    }
  };

  // ── live preview ──
  const ups = Math.max(1, Math.floor(Number(form.units_per_strip)) || 1);
  const spb = Math.max(1, Math.floor(Number(form.strips_per_box)) || 1);
  const entryQty = Math.floor(Number(form.init_qty)) || 0;
  const totalBase = toBaseQty(entryQty, form.init_entry_unit, ups, spb);

  const unitKey = form.init_entry_unit;

  // manufacturer name for the banner
  const mfgName = manufacturers.find(
    (m) => String(m.id) === String(form.manufacturer_id)
  )?.name;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold">Medicines</h1>
        <Button onClick={openCreate}>+ New Medicine</Button>
      </div>

      <Card>
        <div className="flex flex-wrap gap-3 mb-3 items-center">
          <Input placeholder="Search name / generic / barcode..."
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
            { key: "category_name", label: "Category" },
            { key: "manufacturer_name", label: "Manufacturer" },
            { key: "pack", label: "Pack", render: (r) =>
              `${r.units_per_strip} ${r.base_unit}/strip · ${r.strips_per_box} strip/box` },
            { key: "stock", label: "Stock", render: (r) => (
              <div>
                <Badge tone={r.low_stock ? "red" : "green"}>
                  {r.stock} {plural(r.base_unit, r.stock)}
                </Badge>
                {r.stock > 0 && (
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {r.stock} ÷ {r.units_per_strip} ={" "}
                    {Math.floor(r.stock / Math.max(1, r.units_per_strip))} strip
                    {Math.floor(r.stock / Math.max(1, r.units_per_strip)) === 1 ? "" : "s"}
                  </div>
                )}
              </div>
            )},
            { key: "cost_price", label: "Cost/unit", render: (r) => money(r.cost_price) },
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
             title={editing ? `Edit Medicine — ${editing.name}` : "New Medicine"}>
        <form onSubmit={save} className="grid grid-cols-3 gap-4">

          {/* Added-count banner */}
          {addedCount > 0 && !editing && (
            <div className="col-span-3 bg-emerald-50 border border-emerald-200 rounded p-2 text-xs text-emerald-800 flex items-center justify-between">
              <span>
                ✅ <b>{addedCount}</b> medicine{addedCount === 1 ? "" : "s"} added
                {mfgName ? ` to ${mfgName}` : ""}. Keep going or close to finish.
              </span>
              <button
                type="button"
                onClick={() => setAddedCount(0)}
                className="text-emerald-700 font-semibold"
              >
                Reset
              </button>
            </div>
          )}

          {/* ── Basic ── */}
          <div className="col-span-2">
            <Field label="Medicine Name *">
              <Input value={form.name} onChange={set("name")} required />
            </Field>
          </div>
          <Field label="Barcode"><Input value={form.barcode} onChange={set("barcode")} /></Field>

          <Field label="Generic Name"><Input value={form.generic_name} onChange={set("generic_name")} /></Field>
          <Field label="Brand"><Input value={form.brand_name} onChange={set("brand_name")} /></Field>
          <Field label="Type">
            <Select value={form.medicine_type} onChange={set("medicine_type")}>
              {["Tablet", "Capsule", "Syrup", "Injection", "Ointment", "Drops", "Powder", "Inhaler"]
                .map((t) => <option key={t}>{t}</option>)}
            </Select>
          </Field>

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
          <Field label="Strength"><Input value={form.strength} onChange={set("strength")} /></Field>

          <Field label="Dosage Form"><Input value={form.dosage_form} onChange={set("dosage_form")} /></Field>
          <Field label="Pack Type"><Input value={form.pack_type} onChange={set("pack_type")} /></Field>
          <Field label="HSN Code"><Input value={form.hsn_code} onChange={set("hsn_code")} /></Field>

          <Field label="Composition"><Input value={form.composition} onChange={set("composition")} /></Field>
          <Field label="Rack Location"><Input value={form.rack_location} onChange={set("rack_location")} /></Field>
          <div></div>

          <div className="col-span-3">
            <Field label="Description"><Input value={form.description} onChange={set("description")} /></Field>
          </div>

          {/* ── Pricing ── */}
          <div className="col-span-3 border-t pt-3 mt-1">
            <p className="text-xs font-bold uppercase text-emerald-700 mb-2">Pricing</p>
          </div>
          <Field label="GST %"><Input type="number" value={form.gst_rate} onChange={set("gst_rate")} /></Field>
          <Field label="Cost Price"><Input type="number" step="0.01" value={form.cost_price} onChange={set("cost_price")} /></Field>
          <Field label="MRP"><Input type="number" step="0.01" value={form.mrp} onChange={set("mrp")} /></Field>
          <Field label="Selling Price"><Input type="number" step="0.01" value={form.selling_price} onChange={set("selling_price")} /></Field>
          <Field label="Wholesale Price"><Input type="number" step="0.01" value={form.wholesale_price} onChange={set("wholesale_price")} /></Field>
          <Field label="Min Selling Price"><Input type="number" step="0.01" value={form.min_selling_price} onChange={set("min_selling_price")} /></Field>
          <Field label="Reorder Level"><Input type="number" value={form.reorder_level} onChange={set("reorder_level")} /></Field>
          <Field label="Max Level"><Input type="number" value={form.max_level} onChange={set("max_level")} /></Field>

          <label className="col-span-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_prescription}
                   onChange={(e) => setForm({ ...form, is_prescription: e.target.checked })} />
            Prescription required
          </label>

          {/* ── STOCK ENTRY ── */}
          <div className="col-span-3 border-t pt-3 mt-1">
            <p className="text-xs font-bold uppercase text-emerald-700 mb-2">
              {editing ? "Stock" : "Opening Stock (optional)"}
            </p>
            <p className="text-xs text-slate-500 mb-2">
              Pick how you&apos;re entering stock. Only the fields needed for that unit will show.
            </p>
          </div>

          <Field label="Enter stock in">
            <Select value={form.init_entry_unit} onChange={set("init_entry_unit")}>
              <option value="tablet">{plural(form.base_unit, 2)}</option>
              <option value="strip">Strips</option>
              <option value="box">Boxes</option>
            </Select>
          </Field>

          {/* TABLETS */}
          {unitKey === "tablet" && (
            <Field label={`No. of ${plural(form.base_unit, 2)}`}>
              <Input type="number" min="0" step="1" value={form.init_qty}
                     onChange={set("init_qty")} placeholder="0" />
            </Field>
          )}

          {/* STRIPS */}
          {unitKey === "strip" && (
            <>
              <Field label="No. of Strips">
                <Input type="number" min="0" step="1" value={form.init_qty}
                       onChange={set("init_qty")} placeholder="0" />
              </Field>
              <Field label={`No. of ${plural(form.base_unit, 2)} per Strip`}>
                <Input type="number" min="1" step="1" value={form.units_per_strip}
                       onChange={set("units_per_strip")} />
              </Field>
            </>
          )}

          {/* BOXES */}
          {unitKey === "box" && (
            <>
              <Field label="No. of Boxes">
                <Input type="number" min="0" step="1" value={form.init_qty}
                       onChange={set("init_qty")} placeholder="0" />
              </Field>
              <Field label="No. of Strips per Box">
                <Input type="number" min="1" step="1" value={form.strips_per_box}
                       onChange={set("strips_per_box")} />
              </Field>
              <Field label={`No. of ${plural(form.base_unit, 2)} per Strip`}>
                <Input type="number" min="1" step="1" value={form.units_per_strip}
                       onChange={set("units_per_strip")} />
              </Field>
            </>
          )}

          {/* Live preview */}
          <div className="col-span-3 bg-emerald-50 rounded p-3 mt-1">
            <div className="text-xs text-slate-600">Total stock</div>
            <div className="text-xl font-bold text-emerald-700">
              {totalBase} {plural(form.base_unit, totalBase)}
            </div>
            {unitKey === "strip" && entryQty > 0 && (
              <div className="text-xs text-slate-500 mt-1">
                {entryQty} strip{entryQty === 1 ? "" : "s"} × {ups} {form.base_unit}/strip = {totalBase} {plural(form.base_unit, totalBase)}
              </div>
            )}
            {unitKey === "box" && entryQty > 0 && (
              <div className="text-xs text-slate-500 mt-1">
                {entryQty} box{entryQty === 1 ? "" : "es"} × {spb} strips/box × {ups} {form.base_unit}/strip = {totalBase} {plural(form.base_unit, totalBase)}
              </div>
            )}
          </div>

          <Field label="Batch No.">
            <Input value={form.init_batch_no}
                   onChange={set("init_batch_no")} placeholder="OPENING" />
          </Field>
          <Field label="Expiry Date">
            <Input type="date" value={form.init_exp_date}
                   onChange={set("init_exp_date")} />
          </Field>
          <Field label="Mfg Date">
            <Input type="date" value={form.init_mfg_date}
                   onChange={set("init_mfg_date")} />
          </Field>

          <Field label="Batch Cost Price">
            <Input type="number" step="0.01" value={form.init_cost_price}
                   onChange={set("init_cost_price")}
                   placeholder={String(form.cost_price || 0)} />
          </Field>
          <Field label="Batch MRP">
            <Input type="number" step="0.01" value={form.init_mrp}
                   onChange={set("init_mrp")}
                   placeholder={String(form.mrp || 0)} />
          </Field>
          <Field label="Batch Selling Price">
            <Input type="number" step="0.01" value={form.init_selling_price}
                   onChange={set("init_selling_price")}
                   placeholder={String(form.selling_price || 0)} />
          </Field>

          {/* Other batches on edit */}
          {editing && otherBatches.length > 0 && (
            <>
              <div className="col-span-3 border-t pt-3 mt-1">
                <p className="text-xs font-bold uppercase text-slate-500 mb-2">
                  Other Batches ({otherBatches.length}) — not editable here
                </p>
              </div>
              <div className="col-span-3 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-500 border-b">
                      <th className="py-1">Batch No.</th>
                      <th>Entered As</th>
                      <th>Current Stock</th>
                      <th>Expiry</th>
                    </tr>
                  </thead>
                  <tbody>
                    {otherBatches.map((b) => (
                      <tr key={b.id} className="border-b last:border-0">
                        <td className="py-1 font-medium">{b.batch_no}</td>
                        <td>{b.entry_qty || b.qty} {b.entry_unit || "tablet"}</td>
                        <td>{b.qty} {plural(form.base_unit, b.qty)}</td>
                        <td>{b.exp_date || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {error && <p className="col-span-3 text-red-600 text-sm">{error}</p>}

          <div className="col-span-3 flex justify-end gap-3 pt-3 border-t">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            {!editing && (
              <Button
                type="button"
                variant="secondary"
                onClick={saveAndAddAnother}
                className="border-emerald-600 text-emerald-700"
              >
                Save &amp; Add Another
              </Button>
            )}
            <Button type="submit">
              {editing ? "Save Changes" : "Save Medicine"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}