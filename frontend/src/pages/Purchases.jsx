import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { money } from "../api/client";
import { Card, Table, Button, Badge, Modal } from "../components/ui";

export default function Purchases() {
  const [rows, setRows] = useState([]);
  const [detail, setDetail] = useState(null);

  const load = async () => {
    const { data } = await api.get("/purchases");
    setRows(data);
  };
  useEffect(() => { load(); }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold">Purchase Invoices</h1>
        <Link to="/purchases/new"><Button>+ New Purchase</Button></Link>
      </div>

      <Card>
        <Table
          rows={rows}
          columns={[
            { key: "invoice_no", label: "Invoice #" },
            { key: "vendor_name", label: "Vendor" },
            { key: "invoice_date", label: "Date" },
            { key: "items", label: "Items", render: (r) => r.items.length },
            { key: "total", label: "Total", render: (r) => money(r.total) },
            { key: "paid_amount", label: "Paid", render: (r) => money(r.paid_amount) },
            { key: "due_amount", label: "Due", render: (r) => money(r.due_amount) },
            { key: "status", label: "Status", render: (r) => (
              <Badge tone={r.status === "paid" ? "green" : r.status === "partial" ? "amber" : "red"}>
                {r.status}
              </Badge>
            )},
            { key: "_v", label: "", render: (r) => (
              <button onClick={() => setDetail(r)} className="text-blue-600 text-xs font-semibold">View</button>
            )},
          ]}
        />
      </Card>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={`Purchase ${detail?.invoice_no || ""}`} wide>
        {detail && (
          <div>
            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
              <p><b>Vendor:</b> {detail.vendor_name}</p>
              <p><b>Date:</b> {detail.invoice_date}</p>
              <p><b>Total:</b> {money(detail.total)}</p>
              <p><b>Due:</b> {money(detail.due_amount)}</p>
            </div>
            <Table
              rows={detail.items}
              keyField="id"
              columns={[
                { key: "medicine_name", label: "Medicine" },
                { key: "batch_no", label: "Batch" },
                { key: "exp_date", label: "Expiry" },
                { key: "quantity", label: "Qty (base)" },
                { key: "free_qty", label: "Free" },
                { key: "cost_price", label: "Cost/unit", render: (r) => money(r.cost_price) },
                { key: "line_total", label: "Total", render: (r) => money(r.line_total) },
              ]}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}