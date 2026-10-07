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

export default function Sales() {
  const [rows, setRows] = useState([]);
  const [detail, setDetail] = useState(null);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = async () => {
    try {
      const { data } = await api.get("/sales", {
        params: {
          q: q || undefined,
          status: status || undefined,
          from: from || undefined,
          to: to || undefined,
        },
      });
      setRows(data);
    } catch (e) {
      console.error("Load sales failed:", e.response?.data || e.message);
    }
  };

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    /* eslint-disable-next-line */
  }, [q, status, from, to]);

  const clearFilters = () => {
    setQ(""); setStatus(""); setFrom(""); setTo("");
  };

  const hasFilter = q || status || from || to;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-5">Sales</h1>

      <Card className="mb-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
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
            { key: "_v", label: "", render: (r) => (
              <button onClick={() => setDetail(r)}
                      className="text-blue-600 text-xs font-semibold">View</button>
            )},
          ]}
        />
        {rows.length === 0 && (
          <p className="text-center text-slate-400 py-8 text-sm">
            {hasFilter ? "No sales match the current filters." : "No sales yet."}
          </p>
        )}
      </Card>

      <Modal open={!!detail} onClose={() => setDetail(null)}
             title={`Invoice ${detail?.invoice_no || ""}`} wide>
        {detail && <InvoiceView sale={detail} />}
      </Modal>
    </div>
  );
}

/* ─────────── Sales invoice template ─────────── */
function InvoiceView({ sale }) {
  const totalInWords = numberToWords(sale.total);

  return (
    <div className="print-invoice bg-white text-slate-900 text-[11px] font-sans">
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
                  PRIMARIA HEALTH CARE
                </div>
                <div className="leading-tight">Retail Pharmacy</div>
                <div className="leading-tight">Main Road, Your City</div>
                <div className="leading-tight">Phone: 9876543210</div>
                <div className="leading-tight">Email: care@primaria.in</div>
                <div className="leading-tight">GSTIN: 29ABCDE1234F1Z5</div>
                <div className="leading-tight">D.L. No: 20B/21B-12345</div>
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
            <Row label="Payment:" value={(sale.payment_mode || "cash").toUpperCase()} />
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

        {/* Footer */}
        <div className="border-t border-slate-800 p-2 flex justify-between text-[10px]">
          <div>
            <div>Goods once sold will not be taken back.</div>
            <div>Thank you for your visit!</div>
          </div>
          <div className="text-right">
            <div className="font-bold">For PRIMARIA HEALTH CARE</div>
            <div className="mt-4">Authorised Signatory</div>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-4 print:hidden">
        <Button variant="secondary" onClick={() => window.print()}>🖨 Print</Button>
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