import { useEffect, useMemo, useState } from "react";
import api, { money } from "../api/client";
import { Card, Button, Input, Select, Field, Modal } from "../components/ui";

export default function POS() {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [cart, setCart] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [invoice, setInvoice] = useState(null);
  const [error, setError] = useState("");
  const [cash, setCash] = useState("");
  const [upi, setUpi] = useState("");
  const [card, setCard] = useState("");
  const [globalDiscount, setGlobalDiscount] = useState(0);

  useEffect(() => { api.get("/customers").then((r) => setCustomers(r.data)); }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      if (search.trim().length >= 1) {
        api.get("/medicines/search/pos", { params: { q: search } }).then((r) => setResults(r.data));
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
        return prev.map((c) => c.batch_id === batch.id
          ? { ...c, quantity: c.quantity + 1 } : c);
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
        discount_percent: 0,
        quantity: 1,
      }];
    });
    setSearch(""); setResults([]);
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
    const unitBase = Number(it.selling_price) / factor;
    const gross = qtyBase * unitBase;
    const total = gross * (1 - (Number(it.discount_percent) || 0) / 100);
    return { qtyBase, total };
  };

  const subtotal = cart.reduce((s, it) => s + lineCalc(it).total, 0);
  const total = Math.max(0, subtotal - Number(globalDiscount || 0));
  const paid = Number(cash || 0) + Number(upi || 0) + Number(card || 0);
  const change = paid - total;

  const checkout = async () => {
    setError("");
    if (cart.length === 0) return setError("Cart is empty");
    const payments = [];
    if (Number(cash) > 0) payments.push({ mode: "cash", amount: Number(cash) });
    if (Number(upi) > 0) payments.push({ mode: "upi", amount: Number(upi) });
    if (Number(card) > 0) payments.push({ mode: "card", amount: Number(card) });

    const payload = {
      customer_id: customerId ? Number(customerId) : null,
      discount: Number(globalDiscount) || 0,
      payment_mode: payments[0]?.mode || "credit",
      items: cart.map((it) => ({
        medicine_id: it.medicine_id,
        batch_id: it.batch_id,
        quantity: Number(it.quantity),
        unit: it.unit,
        selling_price: Number(it.selling_price) / factorOf(it),
        discount_percent: Number(it.discount_percent) || 0,
      })),
      payments,
    };

    try {
      const { data } = await api.post("/sales", payload);
      setInvoice(data);
      setCart([]); setCash(""); setUpi(""); setCard("");
      setGlobalDiscount(0); setCustomerId("");
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
                    {m.available_batches.length === 0 && <span className="text-red-500 ml-2">Out of stock</span>}
                  </span>
                  <span className="text-slate-500">
                    {money(m.selling_price)}/{m.base_unit}
                    {m.units_per_strip > 1 && ` · ${money(m.selling_price * m.units_per_strip)}/strip`}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card title={`Cart (${cart.length})`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="th">Medicine</th><th className="th">Batch</th>
                  <th className="th">Exp</th><th className="th">Unit</th>
                  <th className="th">Qty</th><th className="th">Price</th>
                  <th className="th">Disc%</th><th className="th text-right">Total</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {cart.map((it, i) => {
                  const { total: lineTotal } = lineCalc(it);
                  return (
                    <tr key={i}>
                      <td className="td font-medium">{it.medicine_name}</td>
                      <td className="td text-xs">{it.batch_no}</td>
                      <td className="td text-xs">{it.exp_date}</td>
                      <td className="td">
                        <select className="input !py-1 !px-2" value={it.unit}
                                onChange={(e) => updateItem(i, "unit", e.target.value)}>
                          <option value="base">{it.base_unit}</option>
                          <option value="strip">Strip</option>
                          <option value="box">Box</option>
                        </select>
                      </td>
                      <td className="td">
                        <input type="number" className="input !py-1 !px-2 w-16" value={it.quantity}
                               onChange={(e) => updateItem(i, "quantity", e.target.value)} />
                      </td>
                      <td className="td">
                        <input type="number" step="0.01" className="input !py-1 !px-2 w-20"
                               value={it.selling_price}
                               onChange={(e) => updateItem(i, "selling_price", e.target.value)} />
                        <span className="text-[10px] text-slate-400 block">per {it.unit}</span>
                      </td>
                      <td className="td">
                        <input type="number" className="input !py-1 !px-2 w-16"
                               value={it.discount_percent}
                               onChange={(e) => updateItem(i, "discount_percent", e.target.value)} />
                      </td>
                      <td className="td text-right font-semibold">{money(lineTotal)}</td>
                      <td className="td">
                        <button onClick={() => removeItem(i)} className="text-red-500 font-bold">×</button>
                      </td>
                    </tr>
                  );
                })}
                {cart.length === 0 && (
                  <tr><td colSpan={9} className="td text-center text-slate-400 py-10">
                    Scan or search medicines to add
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <Card title="Customer">
          <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Walk-in Customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.phone ? `· ${c.phone}` : ""} ({c.customer_type})
              </option>
            ))}
          </Select>
        </Card>

        <Card title="Payment">
          <div className="space-y-3">
            <Field label="Cash"><Input type="number" value={cash} onChange={(e) => setCash(e.target.value)} /></Field>
            <Field label="UPI"><Input type="number" value={upi} onChange={(e) => setUpi(e.target.value)} /></Field>
            <Field label="Card"><Input type="number" value={card} onChange={(e) => setCard(e.target.value)} /></Field>
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

      <Modal open={!!invoice} onClose={() => setInvoice(null)} title="Invoice Created" wide>
        {invoice && <InvoiceView sale={invoice} />}
      </Modal>
    </div>
  );
}

function InvoiceView({ sale }) {
  return (
    <div>
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="text-xl font-bold">💊 Pharmacy ERP</h2>
          <p className="text-xs text-slate-500">GSTIN: 29ABCDE1234F1Z5 · DL: 20B/21B-12345</p>
        </div>
        <div className="text-right text-sm">
          <p className="font-bold">{sale.invoice_no}</p>
          <p className="text-slate-500">{new Date(sale.sale_date).toLocaleString()}</p>
        </div>
      </div>

      <div className="mb-3 text-sm">
        <b>Customer:</b> {sale.customer_name} {sale.customer_phone && `· ${sale.customer_phone}`}
      </div>

      <table className="w-full text-sm border-t">
        <thead>
          <tr><th className="th">Medicine</th><th className="th">Batch</th><th className="th">Exp</th>
              <th className="th">Qty</th><th className="th text-right">Rate</th>
              <th className="th text-right">Total</th></tr>
        </thead>
        <tbody>
          {sale.items.map((it) => (
            <tr key={it.id}>
              <td className="td">{it.medicine_name}</td>
              <td className="td text-xs">{it.batch_no}</td>
              <td className="td text-xs">{it.exp_date}</td>
              <td className="td">{it.quantity}</td>
              <td className="td text-right">{money(it.selling_price)}</td>
              <td className="td text-right">{money(it.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 ml-auto w-64 space-y-1 text-sm">
        <div className="flex justify-between"><span>Subtotal</span><span>{money(sale.sub_total)}</span></div>
        <div className="flex justify-between"><span>Discount</span><span>− {money(sale.discount)}</span></div>
        <div className="flex justify-between"><span>Tax (incl.)</span><span>{money(sale.tax_amount)}</span></div>
        <div className="flex justify-between font-bold text-lg border-t pt-1">
          <span>Total</span><span>{money(sale.total)}</span></div>
        <div className="flex justify-between"><span>Paid</span><span>{money(sale.paid_amount)}</span></div>
        <div className="flex justify-between"><span>Due</span><span>{money(sale.due_amount)}</span></div>
      </div>

      <div className="flex justify-end gap-3 mt-5 print:hidden">
        <Button variant="secondary" onClick={() => window.print()}>🖨 Print</Button>
      </div>
    </div>
  );
}