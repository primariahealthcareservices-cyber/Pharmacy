import { useEffect, useState } from "react";
import api, { money } from "../api/client";
import { Card, Table, Button, Input, Select, Field, Modal } from "../components/ui";

export default function Payments() {
  const [tab, setTab] = useState("customer");
  const [customers, setCustomers] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [custPayments, setCustPayments] = useState([]);
  const [vendPayments, setVendPayments] = useState([]);
  const [custOutstanding, setCustOutstanding] = useState([]);
  const [vendOutstanding, setVendOutstanding] = useState([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ party_id: "", amount: "", mode: "cash", reference: "", notes: "" });

  const load = async () => {
    const [cp, vp, co, vo, c, v] = await Promise.all([
      api.get("/payments/customer"),
      api.get("/payments/vendor"),
      api.get("/payments/outstanding/customers"),
      api.get("/payments/outstanding/vendors"),
      api.get("/customers"),
      api.get("/vendors"),
    ]);
    setCustPayments(cp.data); setVendPayments(vp.data);
    setCustOutstanding(co.data); setVendOutstanding(vo.data);
    setCustomers(c.data); setVendors(v.data);
  };

  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    setError("");
    try {
      if (tab === "customer")
        await api.post("/payments/customer", { ...form, customer_id: Number(form.party_id), amount: Number(form.amount) });
      else
        await api.post("/payments/vendor", { ...form, vendor_id: Number(form.party_id), amount: Number(form.amount) });
      setOpen(false);
      setForm({ party_id: "", amount: "", mode: "cash", reference: "", notes: "" });
      load();
    } catch (e) {
      setError(e.response?.data?.message || "Failed");
    }
  };

  const partyList = tab === "customer" ? customers : vendors;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold">Payments & Ledgers</h1>
        <Button onClick={() => { setError(""); setOpen(true); }}>
          + Record {tab === "customer" ? "Customer" : "Vendor"} Payment
        </Button>
      </div>

      <div className="flex gap-2 mb-4">
        {[
          { key: "customer", label: "Customer Payments" },
          { key: "vendor", label: "Vendor Payments" },
        ].map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${
                    tab === t.key ? "bg-emerald-600 text-white" : "bg-white border text-slate-600"
                  }`}>{t.label}</button>
        ))}
      </div>

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
              ]}
            />
          </Card>

          <Card title="Payment History">
            <Table
              rows={custPayments}
              columns={[
                { key: "payment_date", label: "Date", render: (r) => new Date(r.payment_date).toLocaleString() },
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
              ]}
            />
          </Card>

          <Card title="Payment History">
            <Table
              rows={vendPayments}
              columns={[
                { key: "payment_date", label: "Date", render: (r) => new Date(r.payment_date).toLocaleString() },
                { key: "vendor_name", label: "Vendor" },
                { key: "mode", label: "Mode" },
                { key: "amount", label: "Amount", render: (r) => money(r.amount) },
                { key: "reference", label: "Ref" },
              ]}
            />
          </Card>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)}
             title={`Record ${tab === "customer" ? "Customer" : "Vendor"} Payment`}>
        <form onSubmit={save} className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Field label={tab === "customer" ? "Customer" : "Vendor"}>
              <Select value={form.party_id} required
                      onChange={(e) => setForm({ ...form, party_id: e.target.value })}>
                <option value="">— Select —</option>
                {partyList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Amount">
            <Input type="number" step="0.01" required value={form.amount}
                   onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </Field>
          <Field label="Mode">
            <Select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
              {["cash", "upi", "card", "bank", "cheque"].map((m) => <option key={m}>{m}</option>)}
            </Select>
          </Field>
          <Field label="Reference">
            <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          </Field>
          <Field label="Notes">
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          {error && <p className="col-span-2 text-red-600 text-sm">{error}</p>}
          <div className="col-span-2 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit">Record Payment</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}