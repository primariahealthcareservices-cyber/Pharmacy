import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { money, todayISO } from "../api/client";
import { Card, Button, Input, Select, Field, Table } from "../components/ui";

export default function NewPurchase() {
  const navigate = useNavigate();
  const [vendors, setVendors] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  const [head, setHead] = useState({
    vendor_id: "", invoice_no: "", invoice_date: todayISO(),
    discount: 0, notes: "", payment_amount: 0, payment_mode: "cash",
  });

  const [items, setItems] = useState([]);

  useEffect(() => {
    api.get("/vendors").then((r) => setVendors(r.data));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      if (search.trim().length >= 1)
        api.get("/medicines", { params: { q: search, active_only: 1 } })
           .then((r) => setMedicines(r.data));
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const addItem = (m) => {
    setItems((prev) => [
      ...prev,
      {
        medicine_id: m.id,
        medicine_name: m.name,
        generic_name: m.generic_name,
        base_unit: m.base_unit || "tablet",
        unit: "box",
        units_per_strip: m.units_per_strip || 1,
        strips_per_box: m.strips_per_box || 1,
        quantity: 1,
        free_qty: 0,
        batch_no: "",
        mfg_date: "",
        exp_date: "",
        cost_price: m.cost_price || 0,
        mrp: m.mrp || 0,
        selling_price: m.selling_price || 0,
        gst_rate: m.gst_rate || 12,
        discount_percent: 0,
      },
    ]);
    setSearch("");
    setMedicines([]);
  };

  const update = (i, k, v) => {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)));
  };

  const removeItem = (i) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  // How many base units (tablets) are in ONE purchased unit
  const factorOf = (it) => {
    if (it.unit === "box") return (it.units_per_strip || 1) * (it.strips_per_box || 1);
    if (it.unit === "strip") return it.units_per_strip || 1;
    return 1;
  };

  // Line total = qty × factor × cost/tablet × (1 - discount%)
  const lineTotal = (it) => {
    const q = Number(it.quantity) || 0;
    const c = Number(it.cost_price) || 0;
    const d = Number(it.discount_percent) || 0;
    const f = factorOf(it);
    return q * f * c * (1 - d / 100);
  };

  const subtotal = items.reduce((s, it) => s + lineTotal(it), 0);
  const total = subtotal - Number(head.discount || 0);

  const submit = async () => {
    setError("");
    if (!head.vendor_id) return setError("Select a vendor");
    if (items.length === 0) return setError("Add at least one item");

    const payload = {
      vendor_id: Number(head.vendor_id),
      invoice_no: head.invoice_no || undefined,
      invoice_date: head.invoice_date,
      discount: Number(head.discount) || 0,
      notes: head.notes,
      items: items.map((it) => ({
        medicine_id: it.medicine_id,
        batch_no: it.batch_no || "NA",
        mfg_date: it.mfg_date || null,
        exp_date: it.exp_date || null,
        quantity: Number(it.quantity) || 0,
        unit: it.unit,
        free_qty: Number(it.free_qty) || 0,
        cost_price: Number(it.cost_price) || 0,
        mrp: Number(it.mrp) || 0,
        selling_price: Number(it.selling_price) || 0,
        gst_rate: Number(it.gst_rate) || 12,
        discount_percent: Number(it.discount_percent) || 0,
      })),
      payments: Number(head.payment_amount) > 0
        ? [{ mode: head.payment_mode, amount: Number(head.payment_amount) }] : [],
    };

    try {
      await api.post("/purchases", payload);
      navigate("/purchases");
    } catch (e) {
      setError(e.response?.data?.message || "Failed to save purchase");
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-5">New Purchase</h1>

      {/* ── Header card ── */}
      <Card className="mb-4">
        <div className="grid grid-cols-4 gap-4">
          <Field label="Vendor *">
            <Select value={head.vendor_id}
                    onChange={(e) => setHead({ ...head, vendor_id: e.target.value })}>
              <option value="">— Select —</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select>
          </Field>
          <Field label="Invoice No.">
            <Input value={head.invoice_no}
                   onChange={(e) => setHead({ ...head, invoice_no: e.target.value })} />
          </Field>
          <Field label="Invoice Date">
            <Input type="date" value={head.invoice_date}
                   onChange={(e) => setHead({ ...head, invoice_date: e.target.value })} />
          </Field>
          <Field label="Invoice Discount">
            <Input type="number" value={head.discount}
                   onChange={(e) => setHead({ ...head, discount: e.target.value })} />
          </Field>
        </div>
      </Card>

      {/* ── Search ── */}
      <Card className="mb-4">
        <Field label="Search Medicine to Add">
          <Input placeholder="Type medicine name..." value={search}
                 onChange={(e) => setSearch(e.target.value)} />
        </Field>
        {medicines.length > 0 && (
          <div className="mt-2 border rounded-lg max-h-60 overflow-y-auto divide-y">
            {medicines.map((m) => (
              <button key={m.id} type="button" onClick={() => addItem(m)}
                      className="w-full text-left px-3 py-2 hover:bg-emerald-50 text-sm flex justify-between">
                <span>
                  <b>{m.name}</b>{" "}
                  <span className="text-slate-400">· {m.generic_name || "—"}</span>
                </span>
                <span className="text-slate-500">
                  Stock {m.stock} · MRP {money(m.mrp)}/{m.base_unit}
                </span>
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* ── Items — one card per medicine ── */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">Items ({items.length})</h2>
        </div>

        {items.length === 0 && (
          <Card>
            <p className="text-center text-slate-400 py-8">
              Search above to add medicines
            </p>
          </Card>
        )}

        <div className="space-y-4">
          {items.map((it, i) => (
            <Card key={i} className="!p-0 overflow-hidden">
              {/* Item header */}
              <div className="flex items-center justify-between px-4 py-3 bg-emerald-50 border-b">
                <div>
                  <div className="font-semibold text-slate-800">
                    {i + 1}. {it.medicine_name}
                  </div>
                  {it.generic_name && (
                    <div className="text-xs text-slate-500">{it.generic_name}</div>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-xs text-slate-500">Line total</div>
                    <div className="font-bold text-emerald-700 text-lg">
                      {money(lineTotal(it))}
                    </div>
                  </div>
                  <button
                    onClick={() => removeItem(i)}
                    className="text-red-500 hover:text-red-700 font-bold text-xl leading-none px-2"
                    title="Remove item"
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="p-4 space-y-4">
                {/* Batch info */}
                <div>
                  <p className="text-[11px] font-bold uppercase text-emerald-700 mb-2">
                    Batch
                  </p>
                  <div className="grid grid-cols-4 gap-3">
                    <Field label="Batch No.">
                      <Input value={it.batch_no}
                             onChange={(e) => update(i, "batch_no", e.target.value)}
                             placeholder="e.g. B1234" />
                    </Field>
                    <Field label="Mfg Date">
                      <Input type="date" value={it.mfg_date}
                             onChange={(e) => update(i, "mfg_date", e.target.value)} />
                    </Field>
                    <Field label="Expiry Date">
                      <Input type="date" value={it.exp_date}
                             onChange={(e) => update(i, "exp_date", e.target.value)} />
                    </Field>
                    <Field label="Unit of purchase">
                      <Select value={it.unit}
                              onChange={(e) => update(i, "unit", e.target.value)}>
                        <option value="box">Box</option>
                        <option value="strip">Strip</option>
                        <option value="base">Unit ({it.base_unit})</option>
                      </Select>
                    </Field>
                  </div>
                </div>

                {/* Quantity */}
                <div>
                  <p className="text-[11px] font-bold uppercase text-emerald-700 mb-2">
                    Quantity
                  </p>
                  <div className="grid grid-cols-4 gap-3">
                    <Field label={`Qty (${it.unit === "base" ? it.base_unit : it.unit}s)`}>
                      <Input type="number" min="0" value={it.quantity}
                             onChange={(e) => update(i, "quantity", e.target.value)} />
                    </Field>
                    <Field label="Free Qty">
                      <Input type="number" min="0" value={it.free_qty}
                             onChange={(e) => update(i, "free_qty", e.target.value)} />
                    </Field>
                    <div className="col-span-2 self-end pb-2 text-xs text-slate-500">
                      1 {it.unit === "base" ? it.base_unit : it.unit} ={" "}
                      <b>{factorOf(it)}</b> {it.base_unit}
                      {factorOf(it) === 1 ? "" : "s"}
                      {it.unit === "box" && (
                        <> · {it.units_per_strip}/{it.base_unit} per strip · {it.strips_per_box} strip/box</>
                      )}
                      {it.unit === "strip" && (
                        <> · {it.units_per_strip} {it.base_unit}s per strip</>
                      )}
                    </div>
                  </div>
                </div>

                {/* Pricing */}
                <div>
                  <p className="text-[11px] font-bold uppercase text-emerald-700 mb-2">
                    Pricing (per {it.base_unit})
                  </p>
                  <div className="grid grid-cols-5 gap-3">
                    <Field label={`Cost / ${it.base_unit}`}>
                      <Input type="number" step="0.01" value={it.cost_price}
                             onChange={(e) => update(i, "cost_price", e.target.value)} />
                    </Field>
                    <Field label={`MRP / ${it.base_unit}`}>
                      <Input type="number" step="0.01" value={it.mrp}
                             onChange={(e) => update(i, "mrp", e.target.value)} />
                    </Field>
                    <Field label={`Sell / ${it.base_unit}`}>
                      <Input type="number" step="0.01" value={it.selling_price}
                             onChange={(e) => update(i, "selling_price", e.target.value)} />
                    </Field>
                    <Field label="GST %">
                      <Input type="number" value={it.gst_rate}
                             onChange={(e) => update(i, "gst_rate", e.target.value)} />
                    </Field>
                    <Field label="Discount %">
                      <Input type="number" value={it.discount_percent}
                             onChange={(e) => update(i, "discount_percent", e.target.value)} />
                    </Field>
                  </div>

                  {/* Live calculation breakdown */}
                  {Number(it.quantity) > 0 && (
                    <div className="mt-3 text-xs bg-slate-50 rounded p-2 text-slate-600">
                      <b>
                        {it.quantity}{" "}
                        {it.unit === "base" ? it.base_unit : it.unit}
                        {Number(it.quantity) === 1 ? "" : "s"}
                      </b>
                      {" × "}
                      <b>{factorOf(it)}</b> {it.base_unit}
                      {factorOf(it) === 1 ? "" : "s"}
                      {" × "}
                      <b>{money(it.cost_price)}</b>
                      {Number(it.discount_percent) > 0 && (
                        <>
                          {" × "}
                          <b>{(1 - Number(it.discount_percent) / 100).toFixed(3)}</b>{" "}
                          (after disc)
                        </>
                      )}
                      {" = "}
                      <b className="text-emerald-700">{money(lineTotal(it))}</b>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* ── Payment + Summary ── */}
      <div className="grid grid-cols-3 gap-4">
        <Card title="Payment" className="col-span-2">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Amount Paid Now">
              <Input type="number" value={head.payment_amount}
                     onChange={(e) => setHead({ ...head, payment_amount: e.target.value })} />
            </Field>
            <Field label="Payment Mode">
              <Select value={head.payment_mode}
                      onChange={(e) => setHead({ ...head, payment_mode: e.target.value })}>
                {["cash", "upi", "card", "bank"].map((m) => <option key={m}>{m}</option>)}
              </Select>
            </Field>
            <div className="col-span-2">
              <Field label="Notes">
                <textarea rows="2" className="input" value={head.notes}
                          onChange={(e) => setHead({ ...head, notes: e.target.value })} />
              </Field>
            </div>
          </div>
        </Card>

        <Card title="Summary">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Subtotal</span><span>{money(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>Discount</span><span>− {money(head.discount)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold border-t pt-2">
              <span>Total</span><span>{money(total)}</span>
            </div>
            <div className="flex justify-between text-emerald-600">
              <span>Paid</span><span>{money(head.payment_amount)}</span>
            </div>
            <div className="flex justify-between text-red-600">
              <span>Balance</span>
              <span>{money(total - Number(head.payment_amount || 0))}</span>
            </div>
          </div>

          {error && <p className="text-red-600 text-sm mt-3">{error}</p>}

          <Button className="w-full mt-4" onClick={submit}>Save Purchase</Button>
        </Card>
      </div>
    </div>
  );
}