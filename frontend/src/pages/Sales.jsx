import { useEffect, useState } from "react";
import api, { money } from "../api/client";
import { Card, Table, Badge, Modal, Button, Input, Select, Field } from "../components/ui";

/* ─────────── Amount in words ─────────── */
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven",
  "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen",
  "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty",
  "Seventy", "Eighty", "Ninety"];

function twoDigits(n) {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "");
}
function threeDigits(n) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return (h ? ONES[h] + " Hundred" + (r ? " " : "") : "") + (r ? twoDigits(r) : "");
}
function numberToWords(num) {
  num = Math.floor(Number(num) || 0);
  if (num === 0) return "Zero";
  const crore = Math.floor(num / 10000000);
  const lakh = Math.floor((num % 10000000) / 100000);
  const thousand = Math.floor((num % 100000) / 1000);
  const hundred = num % 1000;
  const parts = [];
  if (crore) parts.push(threeDigits(crore) + " Crore");
  if (lakh) parts.push(threeDigits(lakh) + " Lakh");
  if (thousand) parts.push(threeDigits(thousand) + " Thousand");
  if (hundred) parts.push(threeDigits(hundred));
  return parts.join(" ");
}

/* ─────────── Payment mode helpers ─────────── */
const ONLINE_MODES = [
  "online", "card", "upi", "netbanking", "wallet", "bank",
  "cheque", "neft", "rtgs", "imps",
  "phonepe", "gpay", "googlepay", "paytm", "amazonpay", "bhim", "otherupi",
];

function isOnlineMode(mode) {
  return ONLINE_MODES.includes(String(mode || "").trim().toLowerCase());
}

/* ✅ Human-friendly label */
function paymentModeLabel(mode) {
  const m = String(mode || "").toLowerCase();
  switch (m) {
    case "cash": return "Cash";
    case "phonepe": return "PhonePe";
    case "gpay":
    case "googlepay": return "Google Pay";
    case "paytm": return "Paytm";
    case "amazonpay": return "Amazon Pay";
    case "bhim": return "BHIM UPI";
    case "card": return "Card";
    case "netbanking": return "Net Banking";
    case "upi":
    case "otherupi": return "UPI";
    case "wallet": return "Wallet";
    case "bank": return "Bank";
    case "cheque": return "Cheque";
    case "neft": return "NEFT";
    case "rtgs": return "RTGS";
    case "imps": return "IMPS";
    default: return mode ? m.charAt(0).toUpperCase() + m.slice(1) : "—";
  }
}

/* ✅ Strip "Last4:xxxx" from reference */
function cleanReference(ref) {
  if (!ref) return "";
  return ref
    .split("|")
    .map((s) => s.trim())
    .filter((s) => s && !s.toLowerCase().startsWith("last4:"))
    .join(" | ");
}

/* ✅ Compute overall payment summary from payments[] */
function overallPaymentSummary(sale) {
  const payments = Array.isArray(sale.payments) ? sale.payments : [];
  if (payments.length === 0) {
    // Fallback to sale.payment_mode
    const m = sale.payment_mode || "cash";
    return isOnlineMode(m) ? "Online" : "Cash";
  }
  const hasCash = payments.some((p) => (p.mode || "").toLowerCase() === "cash");
  const hasOnline = payments.some((p) => (p.mode || "").toLowerCase() !== "cash");
  if (hasCash && hasOnline) return "Cash + Online";
  if (hasOnline) return "Online";
  return "Cash";
}

export default function Sales() {
  const [rows, setRows] = useState([]);
  const [detail, setDetail] = useState(null);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [paymentMode, setPaymentMode] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = async () => {
    setError("");
    try {
      const { data } = await api.get("/sales", {
        params: {
          q: q || undefined,
          status: status || undefined,
          payment_mode: paymentMode || undefined,
          from: from || undefined,
          to: to || undefined,
        },
      });
      setRows(data);
    } catch (e) {
      setError(e.response?.data?.message || "Failed to load sales");
      console.error("Load sales failed:", e.response?.data || e.message);
    }
  };

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    /* eslint-disable-next-line */
  }, [q, status, paymentMode, from, to]);

  const clearFilters = () => {
    setQ(""); setStatus(""); setPaymentMode(""); setFrom(""); setTo("");
  };

  const hasFilter = q || status || paymentMode || from || to;

  // ── View handler (fetch fresh from API to get full details) ──
  const handleView = async (sale) => {
    try {
      const { data } = await api.get(`/sales/${sale.id}`);
      setDetail(data);
    } catch (e) {
      // Fallback to the row we already have
      setDetail(sale);
    }
  };

  // ── Delete handler ──
  const handleDelete = async (sale, skipConfirm = false) => {
    if (!skipConfirm) {
      const ok = window.confirm(
        `Delete Invoice "${sale.invoice_no}"?\n\nThis will restore stock and remove the sale. This cannot be undone.`
      );
      if (!ok) return;
    }

    setDeleting(sale.id);
    try {
      await api.delete(`/sales/${sale.id}`);
      setRows((prev) => prev.filter((r) => r.id !== sale.id));
      load();
    } catch (err) {
      const status = err.response?.status;
      const data = err.response?.data;

      let msg = data?.message;
      if (!msg) {
        if (status === 409) {
          msg =
            `Cannot delete "${sale.invoice_no}" because it has returns or ` +
            `related payment records.\n\n` +
            `Tip: Issue a Sales Return instead to cancel this sale.`;
        } else if (status === 500) {
          msg = `Server error while deleting "${sale.invoice_no}".`;
        } else {
          msg = `Delete failed (${status || "unknown"})`;
        }
      }
      alert(msg);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-5">Sales</h1>

      <Card className="mb-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <Field label="Search">
            <Input placeholder="Invoice #, customer, phone..."
                   value={q} onChange={(e) => setQ(e.target.value)} />
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="paid">Paid</option>
              <option value="partial">Partial</option>
              <option value="unpaid">Unpaid</option>
            </Select>
          </Field>
          <Field label="Payment Method">
            <Select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
              <option value="">All methods</option>
              <option value="cash">Cash</option>
              <option value="card">Online / Card</option>
            </Select>
          </Field>
          <Field label="From Date">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To Date">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
        {hasFilter && (
          <div className="mt-3 flex items-center justify-between">
            <div className="text-xs text-slate-500">
              {rows.length} result{rows.length === 1 ? "" : "s"}
            </div>
            <button onClick={clearFilters}
                    className="text-xs font-semibold text-emerald-700 hover:underline">
              Clear filters
            </button>
          </div>
        )}
      </Card>

      {error && (
        <Card className="mb-3">
          <p className="text-red-600 text-sm">{error}</p>
        </Card>
      )}

      <Card>
        <Table
          rows={rows}
          keyField="id"
          columns={[
            { key: "invoice_no", label: "Invoice #" },
            { key: "sale_date", label: "Date", render: (r) =>
              new Date(r.sale_date).toLocaleString() },
            { key: "customer_name", label: "Customer" },
            { key: "items", label: "Items", render: (r) =>
              Array.isArray(r.items) ? r.items.length : 0 },
            { key: "total", label: "Total", render: (r) => money(r.total) },
            { key: "paid_amount", label: "Paid", render: (r) =>
              <span className="text-emerald-700">{money(r.paid_amount)}</span>
            },
            { key: "due_amount", label: "Due", render: (r) => (
              <span className={r.due_amount > 0 ? "text-red-600 font-semibold" : "text-slate-400"}>
                {money(r.due_amount)}
              </span>
            )},
            { key: "payment_status", label: "Status", render: (r) => (
              <Badge tone={r.payment_status === "paid" ? "green"
                : r.payment_status === "partial" ? "amber" : "red"}>
                {r.payment_status}
              </Badge>
            )},
            /* ✅ Payment Method column — uses overall summary */
            { key: "payment_mode", label: "Payment Method", render: (r) => {
              const summary = overallPaymentSummary(r);
              const isCashOnly = summary === "Cash";
              const isOnlineOnly = summary === "Online";
              return (
                <Badge tone={isCashOnly ? "green" : isOnlineOnly ? "blue" : "amber"}>
                  {summary}
                </Badge>
              );
            }},
            { key: "_a", label: "", render: (r) => (
              <div className="flex items-center gap-3">
                <button onClick={() => handleView(r)}
                        className="text-blue-600 text-xs font-semibold hover:underline">
                  View
                </button>
                <button onClick={() => setEditing(r)}
                        className="text-amber-600 text-xs font-semibold hover:underline">
                  ✏️ Edit
                </button>
                <button
                  onClick={() => setConfirmDelete(r)}
                  disabled={deleting === r.id}
                  className={`text-xs font-semibold hover:underline ${
                    deleting === r.id
                      ? "text-slate-400 cursor-not-allowed"
                      : "text-red-600"
                  }`}
                >
                  {deleting === r.id ? "Deleting…" : "🗑 Delete"}
                </button>
              </div>
            )},
          ]}
        />
        {rows.length === 0 && (
          <p className="text-center text-slate-400 py-8 text-sm">
            {hasFilter ? "No sales match the current filters." : "No sales yet."}
          </p>
        )}
      </Card>

      {/* View Modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)}
             title={`Invoice ${detail?.invoice_no || ""}`} wide>
        {detail && <InvoiceView sale={detail} />}
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editing} onClose={() => setEditing(null)}
             title={`Edit Invoice ${editing?.invoice_no || ""}`} wide>
        {editing && (
          <EditSaleForm
            sale={editing}
            onCancel={() => setEditing(null)}
            onSaved={(updated) => {
              setEditing(null);
              setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
              load();
            }}
          />
        )}
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete Sale"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-700">
            Are you sure you want to delete Invoice <b>{confirmDelete?.invoice_no}</b>?
            <br />
            This will restore the items back to stock and cannot be undone.
            <span className="text-red-600 font-semibold"> Proceed with caution.</span>
          </p>
          <div className="flex justify-end gap-3 pt-3 border-t">
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={async () => {
                const s = confirmDelete;
                setConfirmDelete(null);
                if (s) await handleDelete(s, true);
              }}
            >
              Yes, Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ─────────────────────────────────────────
   Edit Sale Form
   ───────────────────────────────────────── */
function EditSaleForm({ sale, onCancel, onSaved }) {
  const [form, setForm] = useState({
    payment_mode: sale.payment_mode || "cash",
    payment_status: sale.payment_status || "unpaid",
    discount: sale.discount ?? 0,
    doctor_name: sale.doctor_name || "",
    prescription_no: sale.prescription_no || "",
    notes: sale.notes || "",
    paid_amount: sale.paid_amount ?? 0,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setSaving(true);
    try {
      const payload = {
        payment_mode: form.payment_mode,
        payment_status: form.payment_status,
        discount: Number(form.discount) || 0,
        doctor_name: form.doctor_name || null,
        prescription_no: form.prescription_no || null,
        notes: form.notes || null,
        paid_amount: Number(form.paid_amount) || 0,
      };
      const { data } = await api.put(`/sales/${sale.id}`, payload);
      onSaved(data);
    } catch (e) {
      setErr(e.response?.data?.message || "Failed to update sale");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {err && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-2">
          {err}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Payment Method">
          <Select value={form.payment_mode}
                  onChange={(e) => setField("payment_mode", e.target.value)}>
            <option value="cash">Cash</option>
            <option value="card">Online / Card</option>
          </Select>
        </Field>

        <Field label="Payment Status">
          <Select value={form.payment_status}
                  onChange={(e) => setField("payment_status", e.target.value)}>
            <option value="paid">Paid</option>
            <option value="partial">Partial</option>
            <option value="unpaid">Unpaid</option>
          </Select>
        </Field>

        <Field label="Discount (₹)">
          <Input type="number" step="0.01" min="0"
                 value={form.discount}
                 onChange={(e) => setField("discount", e.target.value)} />
        </Field>

        <Field label="Paid Amount (₹)">
          <Input type="number" step="0.01" min="0"
                 value={form.paid_amount}
                 onChange={(e) => setField("paid_amount", e.target.value)} />
        </Field>

        <Field label="Doctor Name">
          <Input value={form.doctor_name}
                 onChange={(e) => setField("doctor_name", e.target.value)} />
        </Field>

        <Field label="Prescription No.">
          <Input value={form.prescription_no}
                 onChange={(e) => setField("prescription_no", e.target.value)} />
        </Field>
      </div>

      <Field label="Notes">
        <Input value={form.notes}
               onChange={(e) => setField("notes", e.target.value)} />
      </Field>

      <div className="flex justify-end gap-3 pt-3 border-t">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}

/* ─────────── Sales invoice template ─────────── */
function InvoiceView({ sale }) {
  const totalInWords = numberToWords(sale.total);
  const payments = Array.isArray(sale.payments) ? sale.payments : [];
  const overallPayment = overallPaymentSummary(sale);

  useEffect(() => {
    const originalTitle = document.title;
    const safeCustomerName = (sale.customer_name || "Walk-in_Customer")
      .replace(/[^a-z0-9]/gi, "_");
    document.title = safeCustomerName;
    return () => { document.title = originalTitle; };
  }, [sale]);

  return (
    <div className="print-invoice bg-white text-slate-900 text-[11px] font-sans">
      <div className="border border-slate-800">

        {/* ─── Header ─── */}
        <div className="grid grid-cols-12 border-b border-slate-800">
          <div className="col-span-6 p-2 border-r border-slate-800">
            <div className="flex items-start gap-2">
              <img src="/primaria.png" alt="Primaria"
                   className="h-12 w-auto object-contain"
                   onError={(e) => { e.currentTarget.style.display = "none"; }} />
              <div>
                <div className="font-bold text-[13px] leading-tight">
                  PRIMARIA PHARMACY
                </div>
                <div className="leading-tight">5/8 Brodipet, Guntur, AP</div>
                <div className="leading-tight">Phone: 9247966505</div>
                <div className="leading-tight">Email: info@primariacare.com</div>
                <div className="leading-tight">GSTIN: 37AAQCP012B1ZT</div>
              </div>
            </div>
          </div>
          <div className="col-span-3 p-2 border-r border-slate-800 flex flex-col items-center justify-center text-center">
            <div className="font-bold text-[14px] tracking-wider">** TAX INVOICE **</div>
            <div className="mt-1 text-[10px]">
              {sale.payment_status === "paid" ? "PAID" :
               sale.payment_status === "partial" ? "PARTIAL" : "CREDIT"}
            </div>
          </div>
          <div className="col-span-3 p-2">
            <Row label="Bill No:" value={sale.invoice_no} />
            <Row label="Date:" value={new Date(sale.sale_date).toLocaleDateString("en-IN")} />
            <Row label="Time:" value={new Date(sale.sale_date).toLocaleTimeString("en-IN")} />
            {/* ✅ Uses overall summary (Cash / Online / Cash + Online) */}
            <Row label="Payment:" value={overallPayment} />
          </div>
        </div>

        {/* ─── Customer ─── */}
        <div className="grid grid-cols-12 border-b border-slate-800">
          <div className="col-span-6 p-2 border-r border-slate-800">
            <div className="font-bold">To,</div>
            <div className="font-bold text-[12px]">
              {sale.customer_name || "Walk-in Customer"}
            </div>
            {sale.customer_phone && <div>Phone: {sale.customer_phone}</div>}
            {sale.customer_address && <div>{sale.customer_address}</div>}
          </div>
          <div className="col-span-6 p-2">
            {sale.doctor_name && <Row label="Doctor:" value={sale.doctor_name} />}
            {sale.prescription_no && <Row label="Rx No:" value={sale.prescription_no} />}
            {sale.notes && <Row label="Notes:" value={sale.notes} />}
          </div>
        </div>

        {/* ─── Items ─── */}
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-800">
              <th className="border-r border-slate-800 px-1 py-1 text-center w-8">S.N</th>
              <th className="border-r border-slate-800 px-1 py-1 text-left">PRODUCT NAME</th>
              <th className="border-r border-slate-800 px-1 py-1 text-center">HSN</th>
              <th className="border-r border-slate-800 px-1 py-1 text-center">BATCH</th>
              <th className="border-r border-slate-800 px-1 py-1 text-center">EXP</th>
              <th className="border-r border-slate-800 px-1 py-1 text-center">QTY</th>
              <th className="border-r border-slate-800 px-1 py-1 text-right">MRP</th>
              <th className="border-r border-slate-800 px-1 py-1 text-right">RATE</th>
              <th className="border-r border-slate-800 px-1 py-1 text-right">DIS%</th>
              <th className="border-r border-slate-800 px-1 py-1 text-right">GST%</th>
              <th className="px-1 py-1 text-right">AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((it, i) => (
              <tr key={it.id} className="border-b border-slate-300">
                <td className="border-r border-slate-300 px-1 py-0.5 text-center">{i + 1}</td>
                <td className="border-r border-slate-300 px-1 py-0.5">{it.medicine_name}</td>
                <td className="border-r border-slate-300 px-1 py-0.5 text-center">{it.hsn_code || "-"}</td>
                <td className="border-r border-slate-300 px-1 py-0.5 text-center">{it.batch_no}</td>
                <td className="border-r border-slate-300 px-1 py-0.5 text-center">
                  {it.exp_date ? it.exp_date.slice(2, 7) : "-"}
                </td>
                <td className="border-r border-slate-300 px-1 py-0.5 text-center">{it.quantity}</td>
                <td className="border-r border-slate-300 px-1 py-0.5 text-right">{money(it.mrp)}</td>
                <td className="border-r border-slate-300 px-1 py-0.5 text-right">{money(it.selling_price)}</td>
                <td className="border-r border-slate-300 px-1 py-0.5 text-right">{it.discount_percent || 0}</td>
                <td className="border-r border-slate-300 px-1 py-0.5 text-right">{it.gst_rate || 12}</td>
                <td className="px-1 py-0.5 text-right font-semibold">{money(it.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ─── Totals ─── */}
        <div className="grid grid-cols-12 border-t border-slate-800">
          <div className="col-span-7 p-2 border-r border-slate-800">
            <div className="text-[10px] uppercase font-bold text-slate-600">Amount in words</div>
            <div className="font-semibold">Rupees {totalInWords} Only</div>
          </div>
          <div className="col-span-5 p-2 text-[11px]">
            <Row label="Sub Total:" value={money(sale.sub_total)} />
            <Row label="Discount:" value={"− " + money(sale.discount)} />
            <Row label="Tax:" value={money(sale.tax_amount)} />
            <div className="flex justify-between font-bold border-t border-slate-400 mt-1 pt-1">
              <span>GRAND TOTAL:</span>
              <span>{money(sale.total)}</span>
            </div>
            <Row label="Paid:" value={money(sale.paid_amount)} />
            <div className="flex justify-between font-bold">
              <span>Balance:</span>
              <span className={sale.due_amount > 0 ? "text-red-700" : ""}>
                {money(sale.due_amount)}
              </span>
            </div>
          </div>
        </div>

        {/* ✅ Payment Details Breakdown — with UTR, PhonePe, split payment */}
        {payments.length > 0 && (
          <div className="border-t border-slate-800 p-2">
            <div className="flex justify-between items-center mb-1">
              <div className="text-[10px] uppercase font-bold text-slate-600">
                Payment Details
              </div>
              {payments.length > 1 && (
                <div className="text-[9px] uppercase font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                  Split Payment ({payments.length} methods)
                </div>
              )}
            </div>
            <table className="w-full text-[10px] border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="border border-slate-300 px-1 py-0.5 text-left">Method</th>
                  <th className="border border-slate-300 px-1 py-0.5 text-left">Type</th>
                  <th className="border border-slate-300 px-1 py-0.5 text-right">Amount</th>
                  <th className="border border-slate-300 px-1 py-0.5 text-left">UTR / Reference</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => {
                  const mode = (p.mode || "cash").toLowerCase();
                  const isCash = mode === "cash";
                  return (
                    <tr key={p.id}>
                      <td className="border border-slate-300 px-1 py-0.5 font-semibold">
                        {paymentModeLabel(p.mode)}
                      </td>
                      <td className="border border-slate-300 px-1 py-0.5">
                        {isCash ? "Cash" : "Online"}
                      </td>
                      <td className="border border-slate-300 px-1 py-0.5 text-right">
                        {money(p.amount)}
                      </td>
                      <td className="border border-slate-300 px-1 py-0.5 break-all">
                        {cleanReference(p.reference) || "—"}
                      </td>
                    </tr>
                  );
                })}
                {payments.length > 1 && (
                  <tr className="bg-slate-100 font-bold">
                    <td className="border border-slate-300 px-1 py-0.5" colSpan={2}>
                      Total Paid
                    </td>
                    <td className="border border-slate-300 px-1 py-0.5 text-right">
                      {money(payments.reduce((s, p) => s + (Number(p.amount) || 0), 0))}
                    </td>
                    <td className="border border-slate-300 px-1 py-0.5"></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ─── Footer ─── */}
        <div className="border-t border-slate-800 p-2 flex justify-between text-[10px]">
          <div>
            <div>Goods once sold will not be taken back.</div>
            <div>Thank you for your visit!</div>
          </div>
          <div className="text-right">
            <div className="font-bold">For PRIMARIA PHARMACY</div>
            <div className="mt-4">Authorised Signatory</div>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-4 print:hidden">
        <Button variant="secondary" onClick={() => handlePrint(sale)}>🖨 Print</Button>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-slate-600">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

/* Print helper — sets document.title to customer name so "Save as PDF"
   suggests "<Customer>.pdf" */
function handlePrint(sale) {
  const patient = (sale.customer_name || "Walk-in").trim();
  const safe = (patient || "Invoice").replace(/[\\/:*?"<>|]+/g, "-");

  const prevTitle = document.title;
  document.title = safe;
  window.print();

  const restore = () => {
    document.title = prevTitle;
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);
  setTimeout(restore, 1000);
}