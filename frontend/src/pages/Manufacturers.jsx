import { useEffect, useState } from "react";
import api, { money } from "../api/client";
import CrudPage from "../components/CrudPage";
import { Card, Table, Button, Input, Select, Field, Modal, Badge } from "../components/ui";

/* ─────────────────────────────────────────────
   Manufacturer Payments & Ledger sub-view
   ───────────────────────────────────────────── */
function ManufacturerLedger() {
  const [rows, setRows] = useState([]);
  const [payments, setPayments] = useState([]);
  const [detail, setDetail] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Pay modal
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(null);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("cash");
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const [o, p] = await Promise.all([
        api.get("/payments/outstanding/manufacturers"),
        api.get("/payments/manufacturer"),
      ]);
      setRows(o.data);
      setPayments(p.data);
    } catch (e) {
      console.error("Load manufacturer ledger failed:", e.response?.data || e.message);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const openPay = (r) => {
    setTarget(r);
    setAmount("");
    setMode("cash");
    setReference("");
    setError("");
    setOpen(true);
  };

  const savePay = async (e) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) return setError("Enter a valid amount");
    try {
      await api.post("/payments/manufacturer", {
        manufacturer_id: target.manufacturer_id,
        amount: amt,
        mode,
        reference,
      });
      setOpen(false);
      load();
    } catch (err) {
      setError(err.response?.data?.message || "Failed");
    }
  };

  const viewDetail = async (r) => {
    try {
      const { data } = await api.get(`/payments/manufacturers/${r.manufacturer_id}/summary`);
      setDetail(data);
      setDetailOpen(true);
    } catch (err) {
      console.error("Detail load failed:", err.response?.data || err.message);
    }
  };

  const newBalance = target
    ? Math.max(0, (target.outstanding || 0) - (Number(amount) || 0))
    : 0;

  const statusTone = (s) =>
    s === "paid" ? "green" : s === "partial" ? "amber" : "red";

  return (
    <div className="space-y-4">
      <Card title="Manufacturer Outstanding">
        <Table
          rows={rows}
          keyField="manufacturer_id"
          columns={[
            { key: "name", label: "Manufacturer", render: (r) => (
              <button
                onClick={() => viewDetail(r)}
                className="text-blue-600 font-semibold text-left"
              >
                {r.name}
              </button>
            )},
            { key: "phone", label: "Phone" },
            { key: "medicine_count", label: "Medicines", render: (r) => (
              <div className="flex items-center gap-2">
                <span className="font-medium">{r.medicine_count}</span>
                <button
                  onClick={() => viewDetail(r)}
                  className="px-2 py-0.5 rounded border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100"
                >
                  View
                </button>
              </div>
            )},
            { key: "total_amount", label: "Total Amount", render: (r) => money(r.total_amount) },
            { key: "paid_amount", label: "Paid", render: (r) => (
              <span className="text-emerald-700 font-medium">{money(r.paid_amount)}</span>
            )},
            { key: "outstanding", label: "Balance", render: (r) => (
              <span className={`font-semibold ${r.outstanding > 0.01 ? "text-red-600" : "text-slate-400"}`}>
                {money(r.outstanding)}
              </span>
            )},
            { key: "status", label: "Status", render: (r) => (
              <Badge tone={statusTone(r.status)}>{r.status}</Badge>
            )},
            { key: "_pay", label: "", render: (r) => (
              r.outstanding > 0.01 ? (
                <button
                  onClick={() => openPay(r)}
                  className="px-3 py-1 rounded bg-emerald-600 text-white text-xs font-semibold"
                >
                  Pay
                </button>
              ) : null
            )},
          ]}
        />
      </Card>

      <Card title="Payment History">
        <Table
          rows={payments}
          columns={[
            { key: "payment_date", label: "Date", render: (r) =>
              new Date(r.payment_date).toLocaleString() },
            { key: "manufacturer_name", label: "Manufacturer" },
            { key: "mode", label: "Mode" },
            { key: "amount", label: "Amount", render: (r) => money(r.amount) },
            { key: "reference", label: "Ref" },
            { key: "notes", label: "Notes" },
          ]}
        />
      </Card>

      {/* ── Pay modal ── */}
      <Modal open={open} onClose={() => setOpen(false)}
             title={`Pay ${target?.name || ""}`}>
        <form onSubmit={savePay} className="grid grid-cols-2 gap-4">
          <div className="col-span-2 bg-slate-50 rounded p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-600">Total</span>
              <span className="font-semibold">{money(target?.total_amount || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Already paid</span>
              <span className="text-emerald-700">{money(target?.paid_amount || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Balance</span>
              <span className="font-semibold text-red-600">{money(target?.outstanding || 0)}</span>
            </div>
          </div>

          <div className="col-span-2">
            <Field label="Paid amount">
              <Input type="number" step="0.01" required autoFocus
                     value={amount} onChange={(e) => setAmount(e.target.value)}
                     placeholder={String(target?.outstanding || 0)} />
            </Field>
          </div>

          <Field label="Mode">
            <Select value={mode} onChange={(e) => setMode(e.target.value)}>
              {["cash", "upi", "card", "bank", "cheque"].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Select>
          </Field>
          <Field label="Reference">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>

          <div className="col-span-2 bg-emerald-50 rounded p-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">New balance</span>
              <span className={`font-semibold ${newBalance === 0 ? "text-emerald-700" : "text-amber-600"}`}>
                {money(newBalance)}
              </span>
            </div>
            {newBalance === 0 && (
              <div className="text-xs text-emerald-700 mt-1">
                ✅ Fully paid — Pay button will hide for this manufacturer.
              </div>
            )}
          </div>

          {error && <p className="col-span-2 text-red-600 text-sm">{error}</p>}

          <div className="col-span-2 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit">Save Payment</Button>
          </div>
        </form>
      </Modal>

      {/* ── Detail modal ── */}
      <Modal open={detailOpen} onClose={() => setDetailOpen(false)} wide
             title={detail?.manufacturer?.name || "Manufacturer"}>
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 rounded p-3">
                <div className="text-xs text-slate-500">Total</div>
                <div className="font-semibold">{money(detail.total_amount)}</div>
              </div>
              <div className="bg-slate-50 rounded p-3">
                <div className="text-xs text-slate-500">Paid</div>
                <div className="font-semibold text-emerald-700">{money(detail.paid_amount)}</div>
              </div>
              <div className="bg-slate-50 rounded p-3">
                <div className="text-xs text-slate-500">Balance</div>
                <div className={`font-semibold ${detail.balance > 0 ? "text-red-600" : "text-slate-400"}`}>
                  {money(detail.balance)}
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-bold uppercase text-emerald-700 mb-2">
                Medicines supplied ({detail.medicines.length})
              </p>
              <Table
  rows={detail.medicines}
  columns={[
    { key: "name", label: "Medicine" },
    { key: "sku", label: "SKU" },
    { key: "stock", label: "Stock" },
    { key: "selling_price", label: "Sell/unit", render: (r) => money(r.selling_price) },
    { key: "total_cost", label: "Total Cost", render: (r) => money(r.total_cost) },
  ]}
/>
            </div>

            <div>
              <p className="text-xs font-bold uppercase text-emerald-700 mb-2">
                Payment history ({detail.payments.length})
              </p>
              <Table
                rows={detail.payments}
                columns={[
                  { key: "payment_date", label: "Date", render: (r) =>
                    new Date(r.payment_date).toLocaleString() },
                  { key: "mode", label: "Mode" },
                  { key: "amount", label: "Amount", render: (r) => money(r.amount) },
                  { key: "reference", label: "Ref" },
                ]}
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Manufacturers page — Manage + Ledger tabs
   ───────────────────────────────────────────── */
export default function Manufacturers() {
  const [view, setView] = useState("manage");

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {[
          { key: "manage", label: "Manage Manufacturers" },
          { key: "ledger", label: "💰 Payments & Ledger" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setView(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              view === t.key
                ? "bg-emerald-600 text-white"
                : "bg-white border text-slate-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {view === "manage" && (
        <CrudPage
          title="Manufacturers"
          endpoint="/manufacturers"
          searchPlaceholder="Search manufacturer..."
          columns={[
            { key: "name", label: "Name" },
            { key: "code", label: "Code" },
            { key: "contact_person", label: "Contact" },
            { key: "phone", label: "Phone" },
            { key: "gst_number", label: "GST" },
            { key: "payment_terms", label: "Terms" },
            { key: "medicine_count", label: "Products" },
          ]}
          fields={[
            { name: "name", label: "Manufacturer Name", required: true },
            { name: "code", label: "Company Code" },
            { name: "contact_person", label: "Contact Person" },
            { name: "phone", label: "Phone" },
            { name: "email", label: "Email" },
            { name: "gst_number", label: "GST Number" },
            { name: "drug_license", label: "Drug License" },
            { name: "payment_terms", label: "Payment Terms" },
            { name: "credit_limit", label: "Credit Limit", type: "number" },
            { name: "opening_balance", label: "Opening Balance", type: "number" },
            { name: "address", label: "Address", type: "textarea", full: true },
            { name: "bank_details", label: "Bank Details", type: "textarea", full: true },
          ]}
        />
      )}

      {view === "ledger" && <ManufacturerLedger />}
    </div>
  );
}