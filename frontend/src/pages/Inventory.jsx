import { useEffect, useState } from "react";
import api, { money } from "../api/client";
import { Card, Table, Badge, Button, Modal, Input, Select, Field, Stat } from "../components/ui";

export default function Inventory() {
  const [tab, setTab] = useState("stock");
  const [stock, setStock] = useState([]);
  const [batches, setBatches] = useState([]);
  const [expiry, setExpiry] = useState(null);
  const [low, setLow] = useState([]);
  const [valuation, setValuation] = useState(null);
  const [q, setQ] = useState("");

  const [adjust, setAdjust] = useState(null);
  const [adjQty, setAdjQty] = useState(0);
  const [adjReason, setAdjReason] = useState("count_error");
  const [adjNotes, setAdjNotes] = useState("");

  const loadAll = async () => {
    const [s, e, l, v] = await Promise.all([
      api.get("/inventory/stock", { params: { q } }),
      api.get("/inventory/expiry"),
      api.get("/inventory/low-stock"),
      api.get("/inventory/valuation"),
    ]);
    setStock(s.data); setExpiry(e.data); setLow(l.data); setValuation(v.data);
    const b = await api.get("/inventory/batches");
    setBatches(b.data);
  };

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, [q]);

  const doAdjust = async () => {
    await api.post("/inventory/adjust", {
      batch_id: adjust.id, qty_change: Number(adjQty),
      reason: adjReason, notes: adjNotes,
    });
    setAdjust(null); setAdjQty(0); setAdjNotes(""); loadAll();
  };

  const tabs = [
    { key: "stock", label: "Stock" },
    { key: "batches", label: "Batches" },
    { key: "expiry", label: "Expiry" },
    { key: "low", label: "Low Stock" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-5">Inventory</h1>

      {valuation && (
        <div className="grid grid-cols-4 gap-4 mb-4">
          <Stat label="Stock Value (Cost)" value={money(valuation.cost_value)} tone="slate" />
          <Stat label="Stock Value (MRP)" value={money(valuation.mrp_value)} tone="blue" />
          <Stat label="Potential Margin" value={money(valuation.potential_margin)} tone="green" />
          <Stat label="Active Batches" value={valuation.batches} tone="violet" />
        </div>
      )}

      <div className="flex gap-2 mb-4">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${
                    tab === t.key ? "bg-emerald-600 text-white" : "bg-white border text-slate-600"
                  }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "stock" && (
        <Card>
          <Input placeholder="Search medicine..." value={q} onChange={(e) => setQ(e.target.value)}
                 className="max-w-sm mb-3" />
          <Table
            rows={stock}
            columns={[
              { key: "name", label: "Medicine" },
              { key: "category_name", label: "Category" },
              { key: "pack", label: "Pack", render: (r) =>
                `${r.units_per_strip} ${r.base_unit}/strip × ${r.strips_per_box}/box` },
              { key: "stock", label: "Total Stock", render: (r) => (
                <Badge tone={r.low_stock ? "red" : "green"}>
                  {r.stock} {r.base_unit}{r.stock === 1 ? "" : "s"}
                </Badge>
              )},
              { key: "reorder_level", label: "Reorder Lvl" },
              { key: "stock_value", label: "Stock Value", render: (r) => money(r.stock_value) },
              { key: "batches", label: "Batches", render: (r) => r.batches.length },
            ]}
          />
        </Card>
      )}

      {tab === "batches" && (
        <Card>
          <Table
            rows={batches}
            columns={[
              { key: "medicine_name", label: "Medicine" },
              { key: "batch_no", label: "Batch" },
              { key: "exp_date", label: "Expiry", render: (r) => {
                const d = r.exp_date ? Math.ceil((new Date(r.exp_date) - new Date()) / 86400000) : null;
                return <span>{r.exp_date} {d != null && (
                  <Badge tone={d < 0 ? "red" : d < 90 ? "amber" : "green"}>
                    {d < 0 ? "expired" : `${d}d`}
                  </Badge>
                )}</span>;
              }},
              { key: "qty", label: "Qty" },
              { key: "cost_price", label: "Cost", render: (r) => money(r.cost_price) },
              { key: "mrp", label: "MRP", render: (r) => money(r.mrp) },
              { key: "value", label: "Value", render: (r) => money(r.value) },
              { key: "_a", label: "", render: (r) => (
                <button onClick={() => setAdjust(r)} className="text-blue-600 text-xs font-semibold">
                  Adjust
                </button>
              )},
            ]}
          />
        </Card>
      )}

      {tab === "expiry" && expiry && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {Object.entries(expiry.summary).map(([k, v]) => (
              <Stat key={k} label={k.replace("_", "–")}
                    value={v}
                    tone={k === "expired" ? "red" : k === "0_30" ? "amber" : "slate"} />
            ))}
          </div>
          {Object.entries(expiry.buckets).map(([key, list]) =>
            list.length > 0 && (
              <Card key={key} title={`${key} — ${list.length} batches`}>
                <Table
                  rows={list}
                  columns={[
                    { key: "medicine_name", label: "Medicine" },
                    { key: "batch_no", label: "Batch" },
                    { key: "exp_date", label: "Expiry" },
                    { key: "days_left", label: "Days Left", render: (r) => (
                      <Badge tone={r.days_left < 0 ? "red" : r.days_left < 30 ? "amber" : "green"}>
                        {r.days_left}
                      </Badge>
                    )},
                    { key: "qty", label: "Qty" },
                    { key: "value", label: "Value", render: (r) => money(r.value) },
                  ]}
                />
              </Card>
            )
          )}
        </div>
      )}

      {tab === "low" && (
        <Card>
          <Table
            rows={low}
            columns={[
              { key: "name", label: "Medicine" },
              { key: "stock", label: "Current Stock" },
              { key: "reorder_level", label: "Reorder Level" },
              { key: "suggested_order", label: "Suggested Order" },
            ]}
          />
        </Card>
      )}

      <Modal open={!!adjust} onClose={() => setAdjust(null)} title="Stock Adjustment">
        {adjust && (
          <div className="space-y-4">
            <p className="text-sm">
              <b>{adjust.medicine_name}</b> · Batch {adjust.batch_no} · Current Qty: {adjust.qty}
            </p>
            <Field label="Quantity Change (+/-)">
              <Input type="number" value={adjQty} onChange={(e) => setAdjQty(e.target.value)} />
            </Field>
            <Field label="Reason">
              <Select value={adjReason} onChange={(e) => setAdjReason(e.target.value)}>
                {["damaged", "lost", "expired", "theft", "count_error", "opening"].map((r) =>
                  <option key={r}>{r}</option>)}
              </Select>
            </Field>
            <Field label="Notes">
              <Input value={adjNotes} onChange={(e) => setAdjNotes(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setAdjust(null)}>Cancel</Button>
              <Button onClick={doAdjust}>Apply Adjustment</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}