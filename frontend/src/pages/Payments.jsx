import { useEffect, useState } from "react";
import api, { money } from "../api/client";
import { Card, Table, Button, Input, Select, Field, Modal } from "../components/ui";

export default function Payments() {
  const [tab, setTab] = useState("customer");
  const [customers, setCustomers] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [manufacturers, setManufacturers] = useState([]);

  const [custPayments, setCustPayments] = useState([]);
  const [vendPayments, setVendPayments] = useState([]);
  const [mfrPayments, setMfrPayments] = useState([]);

  const [custOutstanding, setCustOutstanding] = useState([]);
  const [vendOutstanding, setVendOutstanding] = useState([]);
  const [mfrOutstanding, setMfrOutstanding] = useState([]);

  // generic "record payment" modal
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    party_id: "", amount: "", mode: "cash", reference: "", notes: "",
  });

  // quick-pay modal (triggered from an outstanding row)
  const [payOpen, setPayOpen] = useState(false);
  const [payKind, setPayKind] = useState("customer"); // customer | vendor | manufacturer
  const [payTarget, setPayTarget] = useState(null);   // { id, name, outstanding }
  const [payAmount, setPayAmount] = useState("");
  const [payMode, setPayMode] = useState("cash");
  const [payRef, setPayRef] = useState("");
  const [payError, setPayError] = useState("");

  const load = async () => {
    try {
      const [cp, vp, mp, co, vo, mo, c, v, m] = await Promise.all([
        api.get("/payments/customer"),
        api.get("/payments/vendor"),
        api.get("/payments/manufacturer"),
        api.get("/payments/outstanding/customers"),
        api.get("/payments/outstanding/vendors"),
        api.get("/payments/outstanding/manufacturers"),
        api.get("/customers"),
        api.get("/vendors"),
        api.get("/manufacturers"),
      ]);
      setCustPayments(cp.data); setVendPayments(vp.data); setMfrPayments(mp.data);
      setCustOutstanding(co.data); setVendOutstanding(vo.data); setMfrOutstanding(mo.data);
      setCustomers(c.data); setVendors(v.data); setManufacturers(m.data);
    } catch (e) {
      console.error("Load payments failed:", e.response?.data || e.message);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // ── Standard "Record X Payment" modal ──
  const openRecord = () => {
    setError("");
    setForm({ party_id: "", amount: "", mode: "cash", reference: "", notes: "" });
    setOpen(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setError("");
    const amt = Number(form.amount);
    if (!amt || amt <= 0) return setError("Please enter a valid amount");

    try {
      if (tab === "customer") {
        await api.post("/payments/customer", {
          customer_id: Number(form.party_id),
          amount: amt,
          mode: form.mode,
          reference: form.reference,
          notes: form.notes,
        });
      } else if (tab === "vendor") {
        await api.post("/payments/vendor", {
          vendor_id: Number(form.party_id),
          amount: amt,
          mode: form.mode,
          reference: form.reference,
          notes: form.notes,
        });
      } else {
        await api.post("/payments/manufacturer", {
          manufacturer_id: Number(form.party_id),
          amount: amt,
          mode: form.mode,
          reference: form.reference,
          notes: form.notes,
        });
      }
      setOpen(false);
      load();
    } catch (err) {
      setError(err.response?.data?.message || "Failed");
    }
  };

  // ── Quick "Paid" flow ──
  const openQuickPay = (kind, row) => {
    setPayKind(kind);
    setPayTarget({
      id: kind === "customer" ? row.customer_id
        : kind === "vendor" ? row.vendor_id
        : row.manufacturer_id,
      name: row.name,
      outstanding: Number(row.outstanding || 0),
    });
    setPayAmount("");
    setPayMode("cash");
    setPayRef("");
    setPayError("");
    setPayOpen(true);
  };

  const saveQuickPay = async (e) => {
    e.preventDefault();
    setPayError("");
    const amt = Number(payAmount);
    if (!amt || amt <= 0) return setPayError("Enter a valid amount");

    try {
      if (payKind === "customer") {
        await api.post("/payments/customer", {
          customer_id: payTarget.id, amount: amt,
          mode: payMode, reference: payRef,
        });
      } else if (payKind === "vendor") {
        await api.post("/payments/vendor", {
          vendor_id: payTarget.id, amount: amt,
          mode: payMode, reference: payRef,
        });
      } else {
        await api.post("/payments/manufacturer", {
          manufacturer_id: payTarget.id, amount: amt,
          mode: payMode, reference: payRef,
        });
      }
      setPayOpen(false);
      load();
    } catch (err) {
      setPayError(err.response?.data?.message || "Failed");
    }
  };

  const newBalance = payTarget
    ? Math.max(0, payTarget.outstanding - (Number(payAmount) || 0))
    : 0;

  const partyList = tab === "customer" ? customers
    : tab === "vendor" ? vendors
    : manufacturers;

  const partyLabel = tab === "customer" ? "Customer"
    : tab === "vendor" ? "Vendor"
    : "Manufacturer";

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold">Payments &amp; Ledgers</h1>
        <Button onClick={openRecord}>+ Record {partyLabel} Payment</Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {[
          { key: "customer", label: "Customer Payments" },
          { key: "vendor", label: "Vendor Payments" },
          { key: "manufacturer", label: "Manufacturer Payments" },
        ].map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${
                    tab === t.key
                      ? "bg-emerald-600 text-white"
                      : "bg-white border text-slate-600"
                  }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── CUSTOMER TAB ── */}
      {tab === "customer" && (
        <div className="space-y-4">
          <Card title="Outstanding by Customer">
            <Table
              rows={custOutstanding}
              keyField="customer_id"
              columns={[
                { key: "name", label: "Customer" },
                { key: "phone", label: "Phone" },
                { key: "outstanding", label: "Outstanding", render: (r) => (
                  <span className="font-semibold text-red-600">{money(r.outstanding)}</span>
                )},
                { key: "credit_limit", label: "Credit Limit", render: (r) => money(r.credit_limit) },
                { key: "_pay", label: "", render: (r) => (
                  <button
                    onClick={() => openQuickPay("customer", r)}
                    className="px-3 py-1 rounded bg-emerald-600 text-white text-xs font-semibold"
                  >
                    Paid
                  </button>
                )},
              ]}
            />
          </Card>

          <Card title="Payment History">
            <Table
              rows={custPayments}
              columns={[
                { key: "payment_date", label: "Date", render: (r) =>
                  new Date(r.payment_date).toLocaleString() },
                { key: "customer_name", label: "Customer" },
                { key: "mode", label: "Mode" },
                { key: "amount", label: "Amount", render: (r) => money(r.amount) },
                { key: "reference", label: "Ref" },
                { key: "notes", label: "Notes" },
              ]}
            />
          </Card>
        </div>
      )}

      {/* ── VENDOR TAB ── */}
      {tab === "vendor" && (
        <div className="space-y-4">
          <Card title="Outstanding by Vendor">
            <Table
              rows={vendOutstanding}
              keyField="vendor_id"
              columns={[
                { key: "name", label: "Vendor" },
                { key: "phone", label: "Phone" },
                { key: "outstanding", label: "Payable", render: (r) => (
                  <span className="font-semibold text-amber-600">{money(r.outstanding)}</span>
                )},
                { key: "_pay", label: "", render: (r) => (
                  <button
                    onClick={() => openQuickPay("vendor", r)}
                    className="px-3 py-1 rounded bg-emerald-600 text-white text-xs font-semibold"
                  >
                    Paid
                  </button>
                )},
              ]}
            />
          </Card>

          <Card title="Payment History">
            <Table
              rows={vendPayments}
              columns={[
                { key: "payment_date", label: "Date", render: (r) =>
                  new Date(r.payment_date).toLocaleString() },
                { key: "vendor_name", label: "Vendor" },
                { key: "mode", label: "Mode" },
                { key: "amount", label: "Amount", render: (r) => money(r.amount) },
                { key: "reference", label: "Ref" },
              ]}
            />
          </Card>
        </div>
      )}

{/* ── MANUFACTURER TAB ── */}
{tab === "manufacturer" && (
  <div className="space-y-4">
  <Card title="Outstanding by Manufacturer">
  <Table
    rows={mfrOutstanding.filter((r) => (r.outstanding || 0) > 0.01)}
    keyField="manufacturer_id"
    columns={[
      { key: "name", label: "Manufacturer" },
      { key: "phone", label: "Phone" },
      { key: "medicine_count", label: "Medicines" },
      { key: "total_amount", label: "Total", render: (r) =>
        money(r.total_amount || 0) },
      { key: "paid_amount", label: "Paid", render: (r) => (
        <span className="text-emerald-700 font-medium">
          {money(r.paid_amount || 0)}
        </span>
      )},
      { key: "outstanding", label: "Balance", render: (r) => (
        <span className="font-semibold text-red-600">
          {money(r.outstanding || 0)}
        </span>
      )},
      { key: "status", label: "Status", render: (r) => {
        const s = r.status || "unpaid";
        const cls =
          s === "paid" ? "bg-emerald-100 text-emerald-700" :
          s === "partial" ? "bg-amber-100 text-amber-700" :
          "bg-red-100 text-red-700";
        return (
          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>
            {s}
          </span>
        );
      }},
      { key: "_pay", label: "", render: (r) => (
        <button
          onClick={() => openQuickPay("manufacturer", r)}
          className="px-3 py-1 rounded bg-emerald-600 text-white text-xs font-semibold"
        >
          Paid
        </button>
      )},
    ]}
  />
</Card>

    <Card title="Payment History">
      <Table
        rows={mfrPayments}
        columns={[
          { key: "payment_date", label: "Date", render: (r) =>
            new Date(r.payment_date).toLocaleString() },
          { key: "manufacturer_name", label: "Manufacturer" },
          { key: "mode", label: "Mode" },
          { key: "amount", label: "Amount", render: (r) => money(r.amount) },
          { key: "reference", label: "Ref" },
        ]}
      />
    </Card>
  </div>
)}

      {/* ── Record Payment modal ── */}
      <Modal open={open} onClose={() => setOpen(false)}
             title={`Record ${partyLabel} Payment`}>
        <form onSubmit={save} className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Field label={partyLabel}>
              <Select value={form.party_id} required
                      onChange={(e) => setForm({ ...form, party_id: e.target.value })}>
                <option value="">— Select —</option>
                {partyList.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Amount">
            <Input type="number" step="0.01" required value={form.amount}
                   onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </Field>
          <Field label="Mode">
            <Select value={form.mode}
                    onChange={(e) => setForm({ ...form, mode: e.target.value })}>
              {["cash", "upi", "card", "bank", "cheque"].map((m) =>
                <option key={m}>{m}</option>)}
            </Select>
          </Field>
          <Field label="Reference">
            <Input value={form.reference}
                   onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          </Field>
          <Field label="Notes">
            <Input value={form.notes}
                   onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          {error && <p className="col-span-2 text-red-600 text-sm">{error}</p>}
          <div className="col-span-2 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Record Payment</Button>
          </div>
        </form>
      </Modal>

      {/* ── Quick "Paid" modal ── */}
      <Modal open={payOpen} onClose={() => setPayOpen(false)}
             title={`Pay ${payTarget?.name || ""}`}>
        <form onSubmit={saveQuickPay} className="grid grid-cols-2 gap-4">
          <div className="col-span-2 bg-slate-50 rounded p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">Outstanding balance</span>
              <span className="font-semibold text-red-600">
                {money(payTarget?.outstanding || 0)}
              </span>
            </div>
          </div>

          <div className="col-span-2">
            <Field label="Paid amount">
              <Input type="number" step="0.01" required autoFocus
                     value={payAmount}
                     onChange={(e) => setPayAmount(e.target.value)}
                     placeholder={String(payTarget?.outstanding || 0)} />
            </Field>
          </div>

          <Field label="Mode">
            <Select value={payMode} onChange={(e) => setPayMode(e.target.value)}>
              {["cash", "upi", "card", "bank", "cheque"].map((m) =>
                <option key={m}>{m}</option>)}
            </Select>
          </Field>
          <Field label="Reference">
            <Input value={payRef} onChange={(e) => setPayRef(e.target.value)} />
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
                ✅ Fully paid — this entry will disappear from Outstanding.
              </div>
            )}
          </div>

          {payError && <p className="col-span-2 text-red-600 text-sm">{payError}</p>}

          <div className="col-span-2 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setPayOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save Payment</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}