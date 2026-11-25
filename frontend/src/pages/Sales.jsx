import { useEffect, useState, useMemo } from "react";
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

function cleanReference(ref) {
  if (!ref) return "";
  return ref
    .split("|")
    .map((s) => s.trim())
    .filter((s) => s && !s.toLowerCase().startsWith("last4:"))
    .join(" | ");
}

function overallPaymentSummary(sale) {
  const payments = Array.isArray(sale.payments) ? sale.payments : [];
  if (payments.length === 0) {
    const m = sale.payment_mode || "cash";
    return isOnlineMode(m) ? "Online" : "Cash";
  }
  const hasCash = payments.some((p) => (p.mode || "").toLowerCase() === "cash");
  const hasOnline = payments.some((p) => (p.mode || "").toLowerCase() !== "cash");
  if (hasCash && hasOnline) return "Cash + Online";
  if (hasOnline) return "Online";
  return "Cash";
}

/* ─────────── Pagination helper ─────────── */
const PAGE_SIZE = 25;

function Pagination({ page, totalPages, totalRows, onPageChange }) {
  if (totalPages <= 1) return null;

  // Show at most 5 page buttons around the current page
  const pages = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, start + 4);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-slate-200">
      <div className="text-xs text-slate-500">
        Showing <b>{totalRows === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}</b>–
        <b>{Math.min(page * PAGE_SIZE, totalRows)}</b> of <b>{totalRows}</b>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(1)}
          disabled={page === 1}
          className="px-2 py-1 text-xs rounded border border-slate-300 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
          title="First page"
        >
          «
        </button>
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className="px-2 py-1 text-xs rounded border border-slate-300 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Previous"
        >
          ‹ Prev
        </button>

        {start > 1 && (
          <>
            <button
              onClick={() => onPageChange(1)}
              className="px-2 py-1 text-xs rounded border border-slate-300 hover:bg-slate-100"
            >
              1
            </button>
            {start > 2 && <span className="px-1 text-slate-400">…</span>}
          </>
        )}

        {pages.map((p) => (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`px-2 py-1 text-xs rounded border ${
              p === page
                ? "bg-emerald-600 text-white border-emerald-600 font-bold"
                : "border-slate-300 hover:bg-slate-100"
            }`}
          >
            {p}
          </button>
        ))}

        {end < totalPages && (
          <>
            {end < totalPages - 1 && <span className="px-1 text-slate-400">…</span>}
            <button
              onClick={() => onPageChange(totalPages)}
              className="px-2 py-1 text-xs rounded border border-slate-300 hover:bg-slate-100"
            >
              {totalPages}
            </button>
          </>
        )}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          className="px-2 py-1 text-xs rounded border border-slate-300 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Next"
        >
          Next ›
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={page === totalPages}
          className="px-2 py-1 text-xs rounded border border-slate-300 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Last page"
        >
          »
        </button>
      </div>
    </div>
  );
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

  // ── Pagination state ──
  const [page, setPage] = useState(1);

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

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setPage(1);
  }, [q, status, paymentMode, from, to]);

  const clearFilters = () => {
    setQ(""); setStatus(""); setPaymentMode(""); setFrom(""); setTo("");
  };

  const hasFilter = q || status || paymentMode || from || to;

  // ── Derived: paginated slice ──
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedRows = useMemo(() => {
    const startIdx = (safePage - 1) * PAGE_SIZE;
    return rows.slice(startIdx, startIdx + PAGE_SIZE);
  }, [rows, safePage]);

  // If current page is out of range after delete, clamp back
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  // ── View handler ──
  const handleView = async (sale) => {
    try {
      const { data } = await api.get(`/sales/${sale.id}`);
      setDetail(data);
    } catch (e) {
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
          rows={pagedRows}
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

        {rows.length === 0 ? (
          <p className="text-center text-slate-400 py-8 text-sm">
            {hasFilter ? "No sales match the current filters." : "No sales yet."}
          </p>
        ) : (
          <Pagination
            page={safePage}
            totalPages={totalPages}
            totalRows={rows.length}
            onPageChange={setPage}
          />
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

/* ─────────── Scooter delivery illustration (inline SVG, print-safe) ─────────── */
function ScooterIllustration() {
  return (
    <svg viewBox="0 0 150 80" className="h-full w-auto" xmlns="http://www.w3.org/2000/svg"
         aria-label="Delivery scooter">
      <g stroke="#ffffff" strokeWidth="2" strokeLinecap="round" opacity="0.85">
        <line x1="2" y1="30" x2="18" y2="30" />
        <line x1="0" y1="42" x2="14" y2="42" />
        <line x1="6" y1="54" x2="20" y2="54" />
      </g>
      <g transform="translate(22,18)">
        <rect x="0" y="0" width="34" height="26" rx="4" fill="#ef4444" stroke="#ffffff" strokeWidth="1.5" />
        <rect x="14" y="6" width="6" height="14" rx="1" fill="#ffffff" />
        <rect x="10" y="10" width="14" height="6" rx="1" fill="#ffffff" />
      </g>
      <path d="M26 58 C26 46 38 42 54 44 L62 56 Z" fill="#fbbf24" />
      <rect x="52" y="40" width="26" height="6" rx="3" fill="#111827" />
      <rect x="58" y="54" width="42" height="6" rx="3" fill="#f59e0b" />
      <path d="M96 56 L106 24 L113 27 L110 58 Z" fill="#fbbf24" />
      <line x1="106" y1="24" x2="100" y2="18" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
      <circle cx="114" cy="30" r="3.5" fill="#fef9c3" stroke="#ffffff" strokeWidth="1" />
      <circle cx="68" cy="16" r="8" fill="#ffffff" />
      <rect x="62" y="11" width="14" height="6" rx="3" fill="#1e293b" />
      <line x1="68" y1="24" x2="66" y2="40" stroke="#ffffff" strokeWidth="8" strokeLinecap="round" />
      <line x1="70" y1="28" x2="100" y2="20" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" />
      <line x1="64" y1="44" x2="86" y2="54" stroke="#e2e8f0" strokeWidth="5" strokeLinecap="round" />
      <circle cx="38" cy="64" r="11" fill="#1f2937" stroke="#ffffff" strokeWidth="2" />
      <circle cx="38" cy="64" r="4" fill="#9ca3af" />
      <circle cx="108" cy="64" r="11" fill="#1f2937" stroke="#ffffff" strokeWidth="2" />
      <circle cx="108" cy="64" r="4" fill="#9ca3af" />
    </svg>
  );
}

/* ─────────── Advertisement footer strip ─────────── */
function AdFooter() {
  const forcePrintColors = {
    WebkitPrintColorAdjust: "exact",
    printColorAdjust: "exact",
  };

  return (
    <div
      className="relative overflow-hidden text-white"
      style={{
        background: "linear-gradient(100deg, #26338f 0%, #3b4fb5 55%, #5a6ee0 100%)",
        ...forcePrintColors,
      }}
    >
      <style>{`
        @keyframes pos-scooter-ride { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
        @keyframes pos-road-move { from { background-position: 0 0; } to { background-position: -40px 0; } }
        .pos-scooter { animation: pos-scooter-ride 0.9s ease-in-out infinite; }
        .pos-road { animation: pos-road-move 0.8s linear infinite; }
        @media print { .pos-scooter, .pos-road { animation: none !important; } }
      `}</style>

      <div className="absolute -right-6 -top-8 h-24 w-24 rounded-full bg-white/10" />
      <div className="absolute right-24 -bottom-10 h-20 w-20 rounded-full bg-white/10" />

      <div className="relative flex items-center gap-3 px-4 pt-2 pb-3">
        <div className="pos-scooter h-[60px] shrink-0">
          <ScooterIllustration />
        </div>

        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-[9px] font-bold uppercase tracking-[0.25em] text-yellow-300">
            Primaria Pharmacy
          </div>
          <div className="text-[20px] font-black italic tracking-tight leading-none mt-0.5">
            2-HOUR <span className="text-yellow-300">EXPRESS DELIVERY</span>
          </div>
          <div className="text-[10px] mt-1 text-blue-100">
            Medicines at your doorstep · within Guntur city limits
          </div>

          <div className="mt-2 flex flex-col gap-1.5 text-[10px] leading-snug">
            <div className="flex items-center gap-1">
              <span className="font-semibold">General Number:</span>
              <a href="tel:+918121222571" className="font-bold underline decoration-white/50">
                +91 81212 22571
              </a>
            </div>
            <div className="inline-flex items-center gap-1.5 w-fit rounded-md bg-yellow-300 px-2 py-1 text-slate-900 shadow-md">
              <span className="font-black uppercase">📞 Order Now:</span>
              <a href="tel:+919247966505" className="font-black text-[12px] underline decoration-slate-900">
                +91 92479 66505
              </a>
            </div>
          </div>
        </div>

        <div
          className="shrink-0 rotate-[-3deg] rounded-lg bg-yellow-300 px-3 py-1.5 text-center text-slate-900 shadow-md"
          style={forcePrintColors}
        >
          <div className="text-[9px] font-bold uppercase leading-none">Free Delivery</div>
          <div className="text-[15px] font-black leading-tight">on orders ₹1,000+</div>
          <div className="text-[8px] font-semibold leading-none">&amp; all subscription orders</div>
        </div>
      </div>

      <div className="h-[6px] bg-slate-900/80" style={forcePrintColors}>
        <div
          className="pos-road h-full w-full"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, #fde047 0 20px, transparent 20px 40px)",
            backgroundSize: "40px 2px",
            backgroundRepeat: "repeat-x",
            backgroundPosition: "0 center",
            ...forcePrintColors,
          }}
        />
      </div>
    </div>
  );
}

/* ─────────── Invoice template (identical to POS.jsx) ─────────── */
function InvoiceView({ sale }) {
  const totalInWords = numberToWords(sale.total);

  useEffect(() => {
    const originalTitle = document.title;
    const safeCustomerName = (sale.customer_name || "Walk-in_Customer").replace(/[^a-z0-9]/gi, "_");
    document.title = safeCustomerName;
    return () => { document.title = originalTitle; };
  }, [sale]);

  const payments = Array.isArray(sale.payments) ? sale.payments : [];
  const hasCash = payments.some((p) => (p.mode || "").toLowerCase() === "cash");
  const hasOnline = payments.some((p) => (p.mode || "").toLowerCase() !== "cash");
  const overallPaymentType =
    hasCash && hasOnline ? "Cash + Online"
    : hasOnline ? "Online Payment"
    : "Cash";

  return (
    <div className="print-invoice bg-white text-slate-900 text-[11px] font-sans">

      <style type="text/css" media="print">
        {`
          @media print {
            .modal-header,
            [class*="Modal"] > div:first-child,
            [class*="modal"] > div:first-child {
              display: none !important;
            }
            .print\\:hidden {
              display: none !important;
            }
          }
        `}
      </style>

      <div className="border border-slate-800">

        {/* Header */}
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
                <div className="leading-tight mt-1">
                  <span className="font-bold text-[12px] text-red-700 bg-red-50 px-1 py-0.5 rounded border border-red-200">
                    GSTIN: 37AAQCP0312B1ZT
                  </span>
                </div>
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
            <Row label="Payment:" value={overallPaymentType} />
          </div>
        </div>

        {/* Customer */}
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

        {/* Items */}
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

        {/* Totals */}
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

        {/* Payment Details */}
        {payments.length > 0 && (
          <div className="border-t border-slate-800 p-2">
            <div className="text-[10px] uppercase font-bold text-slate-600 mb-1">
              Payment Details
            </div>
            <table className="w-full text-[10px] border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="border border-slate-300 px-1 py-0.5 text-left">Method</th>
                  <th className="border border-slate-300 px-1 py-0.5 text-right">Amount</th>
                  <th className="border border-slate-300 px-1 py-0.5 text-left">UTR / Reference</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="border border-slate-300 px-1 py-0.5">
                      {paymentModeLabel(p.mode)}
                    </td>
                    <td className="border border-slate-300 px-1 py-0.5 text-right">
                      {money(p.amount)}
                    </td>
                    <td className="border border-slate-300 px-1 py-0.5 break-all">
                      {cleanReference(p.reference) || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-slate-800">
          <div className="grid grid-cols-12">
            <div className="col-span-7 p-3 border-r border-slate-800 text-[10px] text-slate-500 italic">
              Goods once sold will not be taken back. Please verify your prescription and items before billing.
              <div className="mt-2 not-italic text-[11px] text-slate-700">
                Thank you for choosing us for your family's health!
              </div>
            </div>
            <div className="col-span-5 p-3 text-right text-[11px]">
              <div className="font-bold text-slate-900">For PRIMARIA PHARMACY</div>
              <div className="mt-6 text-slate-600">Authorised Signatory</div>
            </div>
          </div>

          <AdFooter />
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-4 print:hidden">
        <Button variant="secondary" onClick={() => window.print()}>
          🖨 Print
        </Button>
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