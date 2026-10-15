import { useEffect, useState } from "react";
import api, { money } from "../api/client";
import { Card, Button, Input, Select, Field, Modal } from "../components/ui";

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

/* ─────────── Payment method label helper ─────────── */
function paymentModeLabel(mode) {
  const m = String(mode || "").toLowerCase();
  switch (m) {
    case "cash": return "Cash";
    case "phonepe": return "PhonePe";
    case "gpay": return "Google Pay";
    case "paytm": return "Paytm";
    case "amazonpay": return "Amazon Pay";
    case "bhim": return "BHIM UPI";
    case "card": return "Card";
    case "netbanking": return "Net Banking";
    case "upi": return "UPI";
    default: return mode ? m.charAt(0).toUpperCase() + m.slice(1) : "—";
  }
}

/* ─────────── Clean reference (strip "Last4:xxxx") ─────────── */
function cleanReference(ref) {
  if (!ref) return "";
  // Remove "Last4:1234" and trailing separators
  return ref
    .split("|")
    .map((s) => s.trim())
    .filter((s) => s && !s.toLowerCase().startsWith("last4:"))
    .join(" | ");
}

/* ─────────── Main POS component ─────────── */
export default function POS() {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [cart, setCart] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [invoice, setInvoice] = useState(null);
  const [error, setError] = useState("");
  const [globalDiscount, setGlobalDiscount] = useState(0);

  const [useCash, setUseCash] = useState(true);
  const [useOnline, setUseOnline] = useState(false);
  const [cash, setCash] = useState("");

  /* ✅ Online method default to phonepe */
  const [onlineMethod, setOnlineMethod] = useState("phonepe");
  const [online, setOnline] = useState("");
  const [onlineRef, setOnlineRef] = useState("");
  const [onlineLast4, setOnlineLast4] = useState("");

  const [successInvoice, setSuccessInvoice] = useState(null);

  useEffect(() => {
    api.get("/customers").then((r) => setCustomers(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      if (search.trim().length >= 1) {
        api.get("/medicines/search/pos", { params: { q: search } })
           .then((r) => setResults(r.data))
           .catch(() => setResults([]));
      } else setResults([]);
    }, 200);
    return () => clearTimeout(t);
  }, [search]);

  const addToCart = (med) => {
    const batch = med.available_batches?.[0];
    if (!batch) { alert("No stock available"); return; }
    setCart((prev) => {
      const existing = prev.find((c) => c.batch_id === batch.id);
      if (existing) {
        return prev.map((c) =>
          c.batch_id === batch.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [...prev, {
        medicine_id: med.id,
        medicine_name: med.name,
        batch_id: batch.id,
        batch_no: batch.batch_no,
        exp_date: batch.exp_date,
        unit: "strip",
        units_per_strip: med.units_per_strip,
        strips_per_box: med.strips_per_box,
        base_unit: med.base_unit,
        available: batch.qty,
        selling_price: batch.selling_price || med.selling_price,
        mrp: batch.mrp || med.mrp,
        cost_price: batch.cost_price || med.cost_price,
        gst_rate: batch.gst_rate || med.gst_rate,
        hsn_code: med.hsn_code || "",
        discount_percent: 0,
        quantity: 1,
      }];
    });
    setSearch("");
    setResults([]);
  };

  const updateItem = (i, k, v) =>
    setCart((prev) => prev.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)));

  const removeItem = (i) => setCart((prev) => prev.filter((_, idx) => idx !== i));

  const factorOf = (it) => {
    if (it.unit === "box") return (it.units_per_strip || 1) * (it.strips_per_box || 1);
    if (it.unit === "strip") return it.units_per_strip || 1;
    return 1;
  };

  const lineCalc = (it) => {
    const factor = factorOf(it);
    const qtyBase = (Number(it.quantity) || 0) * factor;
    const unitPrice = Number(it.selling_price) || 0;
    const gross = qtyBase * unitPrice;
    const total = gross * (1 - (Number(it.discount_percent) || 0) / 100);
    return { qtyBase, factor, total, unitPrice };
  };

  const subtotal = cart.reduce((s, it) => s + lineCalc(it).total, 0);
  const total = Math.max(0, subtotal - Number(globalDiscount || 0));

  const cashAmt = useCash ? Number(cash || 0) : 0;
  const onlineAmt = useOnline ? Number(online || 0) : 0;
  const paid = cashAmt + onlineAmt;
  const change = paid - total;

  /* ✅ Only keep UTR (no Last4) */
  const buildOnlineReference = () => {
    if (onlineRef.trim()) return `UTR:${onlineRef.trim()}`;
    return null;
  };

  const resetForm = () => {
    setCart([]);
    setUseCash(true);
    setUseOnline(false);
    setCash("");
    setOnline("");
    setOnlineRef("");
    setOnlineLast4("");
    setOnlineMethod("phonepe");
    setGlobalDiscount(0);
    setCustomerId("");
  };

  const checkout = async () => {
    setError("");
    if (cart.length === 0) return setError("Cart is empty");

    if (!useCash && !useOnline) {
      return setError("Please select a payment method (Cash or Online)");
    }
    if (useCash && Number(cash) <= 0 && !useOnline) {
      return setError("Please enter a cash amount");
    }
    if (useOnline && Number(online) <= 0) {
      return setError("Please enter the online payment amount");
    }
    if (useOnline && !onlineRef.trim()) {
      return setError("Please enter the UTR / Transaction ID");
    }

    for (const it of cart) {
      const { qtyBase } = lineCalc(it);
      if (qtyBase > (it.available || 0)) {
        return setError(
          `Not enough stock for ${it.medicine_name}. Available: ${it.available} ${it.base_unit}s`
        );
      }
    }

    const payments = [];
    if (useCash && cashAmt > 0) {
      payments.push({ mode: "cash", amount: cashAmt });
    }
    if (useOnline && onlineAmt > 0) {
      payments.push({
        mode: onlineMethod,
        amount: onlineAmt,
        reference: buildOnlineReference(),
      });
    }

    const payload = {
      customer_id: customerId ? Number(customerId) : null,
      discount: Number(globalDiscount) || 0,
      payment_mode: payments[0]?.mode || "credit",
      items: cart.map((it) => ({
        medicine_id: it.medicine_id,
        batch_id: it.batch_id,
        quantity: Number(it.quantity),
        unit: it.unit,
        selling_price: Number(it.selling_price),
        discount_percent: Number(it.discount_percent) || 0,
      })),
      payments,
    };

    try {
      const { data } = await api.post("/sales", payload);
      setSuccessInvoice(data);
      resetForm();
    } catch (e) {
      setError(e.response?.data?.message || "Checkout failed");
    }
  };

  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="col-span-2">
        <h1 className="text-2xl font-bold mb-4">POS / Billing</h1>

        <Card className="mb-4">
          <Input autoFocus placeholder="🔍 Scan barcode or search medicine name..."
                 value={search} onChange={(e) => setSearch(e.target.value)} />
          {results.length > 0 && (
            <div className="mt-2 border rounded-lg max-h-72 overflow-y-auto divide-y">
              {results.map((m) => (
                <button key={m.id} onClick={() => addToCart(m)} type="button"
                        className="w-full text-left px-3 py-2 hover:bg-emerald-50 text-sm flex justify-between">
                  <span>
                    <b>{m.name}</b>
                    <span className="text-slate-400"> · {m.generic_name}</span>
                    {m.available_batches.length === 0 &&
                      <span className="text-red-500 ml-2">Out of stock</span>}
                  </span>
                  <span className="text-slate-500">
                    {money(m.selling_price)}/{m.base_unit}
                    {m.units_per_strip > 1 &&
                      ` · ${money(m.selling_price * m.units_per_strip)}/strip`}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Card>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold">Cart ({cart.length})</h2>
            {cart.length > 0 && (
              <button onClick={() => setCart([])}
                      className="text-xs font-semibold text-red-600 hover:underline">
                Clear cart
              </button>
            )}
          </div>

          {cart.length === 0 && (
            <Card>
              <p className="text-center text-slate-400 py-10">
                Scan or search medicines to add
              </p>
            </Card>
          )}

          <div className="space-y-3">
            {cart.map((it, i) => {
              const { total: lineTotal, qtyBase, factor } = lineCalc(it);
              const overStock = qtyBase > (it.available || 0);

              return (
                <Card key={i}
                      className={`!p-0 overflow-hidden ${overStock ? "border-red-300" : ""}`}>
                  <div className="flex items-center justify-between px-3 py-2 bg-emerald-50 border-b">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-800 truncate">
                        {i + 1}. {it.medicine_name}
                      </div>
                      <div className="text-xs text-slate-500">
                        Batch <b>{it.batch_no}</b>
                        {it.exp_date && <> · Exp {it.exp_date}</>}
                        {overStock && (
                          <span className="text-red-600 font-semibold ml-2">
                            ⚠ Only {it.available} {it.base_unit}s in stock
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <div className="text-[10px] uppercase text-slate-400">Line total</div>
                        <div className="font-bold text-emerald-700 text-lg leading-tight">
                          {money(lineTotal)}
                        </div>
                      </div>
                      <button onClick={() => removeItem(i)}
                              className="text-red-500 hover:text-red-700 text-xl font-bold px-1"
                              title="Remove">×</button>
                    </div>
                  </div>

                  <div className="p-3 space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <Field label="Unit">
                        <Select value={it.unit}
                                onChange={(e) => updateItem(i, "unit", e.target.value)}>
                          <option value="base">{it.base_unit}</option>
                          <option value="strip">Strip</option>
                          <option value="box">Box</option>
                        </Select>
                      </Field>
                      <Field label={`Qty (${it.unit === "base" ? it.base_unit : it.unit}s)`}>
                        <Input type="number" min="1" value={it.quantity}
                               onChange={(e) => updateItem(i, "quantity", e.target.value)} />
                      </Field>
                      <div className="self-end pb-2 text-xs text-slate-500">
                        = <b className="text-slate-800">{qtyBase}</b> {it.base_unit}s
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <Field label={`Price / ${it.base_unit}`}>
                        <Input type="number" step="0.01" value={it.selling_price}
                               onChange={(e) => updateItem(i, "selling_price", e.target.value)} />
                      </Field>
                      <Field label="Discount %">
                        <Input type="number" min="0" max="100" value={it.discount_percent}
                               onChange={(e) => updateItem(i, "discount_percent", e.target.value)} />
                      </Field>
                      <div className="self-end pb-2 text-xs text-slate-500">
                        {it.units_per_strip > 1 && (
                          <>
                            {money(it.selling_price)}/{it.base_unit}{" · "}
                            {money((Number(it.selling_price) || 0) * (it.units_per_strip || 1))}/strip
                          </>
                        )}
                      </div>
                    </div>

                    <div className="text-xs bg-slate-50 rounded p-2 text-slate-600">
                      <b>{it.quantity}</b>{" "}
                      {it.unit === "base" ? it.base_unit : it.unit}
                      {Number(it.quantity) === 1 ? "" : "s"}
                      {" × "}<b>{factor}</b> {it.base_unit}{factor === 1 ? "" : "s"}
                      {" × "}<b>{money(it.selling_price)}</b>
                      {Number(it.discount_percent) > 0 && <> − <b>{it.discount_percent}%</b></>}
                      {" = "}
                      <b className="text-emerald-700">{money(lineTotal)}</b>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN */}
      <div className="space-y-4">
        <Card title="Customer">
          <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Walk-in Customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.phone ? `· ${c.phone}` : ""}
              </option>
            ))}
          </Select>
        </Card>

        <Card title="Payment">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-4 items-center">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={useCash}
                  onChange={(e) => {
                    setUseCash(e.target.checked);
                    if (!e.target.checked) setCash("");
                  }}
                  className="w-4 h-4 accent-emerald-600"
                />
                <span className="text-sm font-semibold text-slate-700">Cash</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={useOnline}
                  onChange={(e) => {
                    setUseOnline(e.target.checked);
                    if (!e.target.checked) {
                      setOnline(""); setOnlineRef(""); setOnlineLast4("");
                    }
                  }}
                  className="w-4 h-4 accent-blue-600"
                />
                <span className="text-sm font-semibold text-slate-700">Online Payment</span>
              </label>
            </div>

            {useCash && (
              <div className="ml-2 pl-3 border-l-2 border-emerald-400 bg-emerald-50/50 rounded p-2 space-y-2">
                <Field label="Cash Amount *">
                  <Input type="number" placeholder="Enter cash received"
                         value={cash}
                         onChange={(e) => setCash(e.target.value)} />
                </Field>
              </div>
            )}

            {useOnline && (
              <div className="ml-2 pl-3 border-l-2 border-blue-400 bg-blue-50/50 rounded p-2 space-y-2">
                <Field label="Online Method *">
                  {/* ✅ NEW: Specific apps */}
                  <Select value={onlineMethod}
                          onChange={(e) => setOnlineMethod(e.target.value)}>
                    <option value="phonepe">PhonePe</option>
                    <option value="gpay">Google Pay</option>
                    <option value="paytm">Paytm</option>
                    <option value="amazonpay">Amazon Pay</option>
                    <option value="bhim">BHIM UPI</option>
                    <option value="upi">Other UPI</option>
                    <option value="card">Card</option>
                    <option value="netbanking">Net Banking</option>
                  </Select>
                </Field>

                <Field label="Amount Paid *">
                  <Input type="number" placeholder="Enter amount"
                         value={online}
                         onChange={(e) => setOnline(e.target.value)} />
                </Field>

                <Field label="UTR / Transaction ID *">
                  <Input
                    placeholder="e.g. 123456789012"
                    value={onlineRef}
                    onChange={(e) => setOnlineRef(e.target.value)}
                  />
                </Field>
              </div>
            )}

            <Field label="Extra Discount">
              <Input type="number" value={globalDiscount}
                     onChange={(e) => setGlobalDiscount(e.target.value)} />
            </Field>
          </div>
        </Card>

        <Card title="Summary">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span>{money(subtotal)}</span></div>
            <div className="flex justify-between"><span>Discount</span><span>− {money(globalDiscount)}</span></div>
            <div className="flex justify-between text-xl font-bold border-t pt-2">
              <span>Total</span><span>{money(total)}</span>
            </div>
            <div className="flex justify-between"><span>Paid</span><span>{money(paid)}</span></div>
            <div className={`flex justify-between font-semibold ${change < 0 ? "text-red-600" : "text-emerald-600"}`}>
              <span>{change < 0 ? "Balance Due" : "Change"}</span>
              <span>{money(Math.abs(change))}</span>
            </div>
          </div>
          {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
          <Button className="w-full mt-4" onClick={checkout}>Complete Sale</Button>
        </Card>
      </div>

      {/* SUCCESS POPUP */}
      <Modal
        open={!!successInvoice}
        onClose={() => setSuccessInvoice(null)}
        title=""
      >
        {successInvoice && (
          <div className="text-center space-y-4 py-2">
            <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg"
                     className="h-7 w-7 text-white" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd" />
                </svg>
              </div>
            </div>

            <h2 className="text-xl font-bold text-emerald-700">
              Payment Completed!
            </h2>

            <p className="text-sm text-slate-600">
              Invoice <b className="text-slate-900">{successInvoice.invoice_no}</b> has been created.
            </p>

            <div className="bg-slate-50 rounded-lg p-4 text-sm space-y-2 text-left">
              <div className="flex justify-between">
                <span className="text-slate-500">Customer</span>
                <span className="font-semibold">
                  {successInvoice.customer_name || "Walk-in"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total</span>
                <span className="font-semibold">{money(successInvoice.total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Paid</span>
                <span className="font-semibold text-emerald-700">
                  {money(successInvoice.paid_amount)}
                </span>
              </div>
              {successInvoice.due_amount > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Balance Due</span>
                  <span className="font-semibold text-red-600">
                    {money(successInvoice.due_amount)}
                  </span>
                </div>
              )}

              {Array.isArray(successInvoice.payments) && successInvoice.payments.length > 0 && (
                <div className="border-t border-slate-200 pt-2 mt-2">
                  <div className="text-[10px] uppercase text-slate-500 font-bold mb-1">
                    Payment Details
                  </div>
                  {successInvoice.payments.map((p, i) => (
                    <div key={i} className="text-xs border-b border-slate-100 py-1 last:border-0">
                      <div className="flex justify-between">
                        {/* ✅ Show app name like PhonePe */}
                        <span className="font-semibold text-slate-700">
                          {paymentModeLabel(p.mode)}
                        </span>
                        <span className="font-semibold">{money(p.amount)}</span>
                      </div>
                      {p.reference && (
                        <div className="text-[10px] text-slate-500 mt-0.5 break-all">
                          {cleanReference(p.reference)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-center gap-3 pt-2">
              <Button variant="secondary" onClick={() => setSuccessInvoice(null)}>
                New Sale
              </Button>
              <Button
                onClick={() => {
                  const inv = successInvoice;
                  setSuccessInvoice(null);
                  setInvoice(inv);
                }}
              >
                View / Print Invoice
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* INVOICE MODAL */}
      <Modal open={!!invoice} onClose={() => setInvoice(null)} title="Invoice" wide>
        {invoice && <InvoiceView sale={invoice} />}
      </Modal>
    </div>
  );
}

/* ─────────── Invoice template ─────────── */
function InvoiceView({ sale }) {
  const totalInWords = numberToWords(sale.total);

  useEffect(() => {
    const originalTitle = document.title;
    const safeCustomerName = (sale.customer_name || "Walk-in_Customer").replace(/[^a-z0-9]/gi, '_');
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

        {/* ✅ Payment Details — app name, no Last4 */}
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
                    {/* ✅ Human-friendly label (PhonePe, Google Pay, Cash, …) */}
                    <td className="border border-slate-300 px-1 py-0.5">
                      {paymentModeLabel(p.mode)}
                    </td>
                    <td className="border border-slate-300 px-1 py-0.5 text-right">
                      {money(p.amount)}
                    </td>
                    <td className="border border-slate-300 px-1 py-0.5 break-all">
                      {/* ✅ Hide Last4 from reference */}
                      {cleanReference(p.reference) || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
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
        <Button variant="secondary" onClick={() => window.print()}>
          🖨 Print
        </Button>
      </div>
    </div>
  );
}

/* ─── Tiny helper: label + value row ─── */
function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-slate-600">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}