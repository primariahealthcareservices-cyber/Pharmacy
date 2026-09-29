import { useEffect, useState } from "react";
import api, { money } from "../api/client";
import { Card, Table, Badge, Modal, Button } from "../components/ui";

export default function Sales() {
  const [rows, setRows] = useState([]);
  const [detail, setDetail] = useState(null);

  useEffect(() => { api.get("/sales").then((r) => setRows(r.data)); }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-5">Sales</h1>
      <Card>
        <Table
          rows={rows}
          columns={[
            { key: "invoice_no", label: "Invoice #" },
            { key: "sale_date", label: "Date", render: (r) => new Date(r.sale_date).toLocaleString() },
            { key: "customer_name", label: "Customer" },
            { key: "items", label: "Items", render: (r) => r.items.length },
            { key: "total", label: "Total", render: (r) => money(r.total) },
            { key: "profit", label: "Profit", render: (r) => (
              <span className="text-emerald-600 font-semibold">{money(r.profit)}</span>
            )},
            { key: "paid_amount", label: "Paid", render: (r) => money(r.paid_amount) },
            { key: "due_amount", label: "Due", render: (r) => money(r.due_amount) },
            { key: "payment_status", label: "Status", render: (r) => (
              <Badge tone={r.payment_status === "paid" ? "green"
                : r.payment_status === "partial" ? "amber" : "red"}>
                {r.payment_status}
              </Badge>
            )},
            { key: "_v", label: "", render: (r) => (
              <button onClick={() => setDetail(r)} className="text-blue-600 text-xs font-semibold">View</button>
            )},
          ]}
        />
      </Card>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={`Invoice ${detail?.invoice_no || ""}`} wide>
        {detail && (
          <div>
            <div className="grid grid-cols-3 gap-3 text-sm mb-4">
              <p><b>Customer:</b> {detail.customer_name}</p>
              <p><b>Date:</b> {new Date(detail.sale_date).toLocaleString()}</p>
              <p><b>Status:</b> {detail.payment_status}</p>
            </div>
            <Table
              rows={detail.items}
              columns={[
                { key: "medicine_name", label: "Medicine" },
                { key: "batch_no", label: "Batch" },
                { key: "exp_date", label: "Expiry" },
                { key: "quantity", label: "Qty" },
                { key: "selling_price", label: "Rate", render: (r) => money(r.selling_price) },
                { key: "discount_percent", label: "Disc%" },
                { key: "line_total", label: "Total", render: (r) => money(r.line_total) },
              ]}
            />
            <div className="mt-4 ml-auto w-72 space-y-1 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>{money(detail.sub_total)}</span></div>
              <div className="flex justify-between"><span>Discount</span><span>− {money(detail.discount)}</span></div>
              <div className="flex justify-between font-bold border-t pt-1 text-lg">
                <span>Total</span><span>{money(detail.total)}</span></div>
              <div className="flex justify-between"><span>Paid</span><span>{money(detail.paid_amount)}</span></div>
              <div className="flex justify-between text-red-600"><span>Due</span><span>{money(detail.due_amount)}</span></div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}