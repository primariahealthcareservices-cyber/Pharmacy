import { useEffect, useState } from "react";
import api, { money, todayISO } from "../api/client";
import { Card, Table, Button, Input, Stat } from "../components/ui";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend } from "recharts";

export default function Reports() {
  const [tab, setTab] = useState("profit");
  const [from, setFrom] = useState(todayISO().slice(0, 8) + "01");
  const [to, setTo] = useState(todayISO());
  const [data, setData] = useState(null);

  const load = async () => {
    const params = { from, to };
    const map = {
      profit: "/reports/profit",
      sales: "/reports/sales",
      products: "/reports/products",
      stock: "/reports/stock",
      expiry: "/reports/expiry",
      customers: "/reports/customers",
      vendors: "/reports/vendors",
    };
    const { data } = await api.get(map[tab], { params });
    setData(data);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab, from, to]);

  const tabs = ["profit", "sales", "products", "stock", "expiry", "customers", "vendors"];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-5">Reports</h1>

      <Card className="mb-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="label">From</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">To</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button onClick={load}>Refresh</Button>
          <div className="flex gap-2 ml-auto flex-wrap">
            {tabs.map((t) => (
              <button key={t} onClick={() => setTab(t)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize ${
                        tab === t ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"
                      }`}>{t}</button>
            ))}
          </div>
        </div>
      </Card>

      {tab === "profit" && data && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            <Stat label="Net Sales" value={money(data.net_sales)} tone="green" />
            <Stat label="COGS" value={money(data.cogs)} tone="amber" />
            <Stat label="Gross Profit" value={money(data.gross_profit)} tone="blue"
                  sub={`Margin ${data.gross_margin_pct}%`} />
            <Stat label="Net Profit" value={money(data.net_profit)} tone="violet"
                  sub={`Expenses ${money(data.expenses)}`} />
          </div>

          <Card title="Expenses by Category">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={Object.entries(data.expenses_by_category).map(([k, v]) => ({ name: k, value: v }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => money(v)} />
                <Bar dataKey="value" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      )}

      {tab === "sales" && data && (
        <div className="space-y-4">
          <div className="grid grid-cols-5 gap-4">
            <Stat label="Orders" value={data.count} />
            <Stat label="Total Sales" value={money(data.total)} tone="green" />
            <Stat label="Tax Collected" value={money(data.tax)} tone="blue" />
            <Stat label="Discounts" value={money(data.discount)} tone="amber" />
            <Stat label="Gross Profit" value={money(data.profit)} tone="violet" />
          </div>
          <Card title="Daily Sales">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.by_day}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => money(v)} />
                <Bar dataKey="amount" fill="#059669" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card title="By Payment Mode">
            <Table rows={Object.entries(data.by_mode).map(([k, v], i) => ({ id: i, mode: k, amount: v }))}
                   columns={[
                     { key: "mode", label: "Mode" },
                     { key: "amount", label: "Amount", render: (r) => money(r.amount) },
                   ]} />
          </Card>
        </div>
      )}

      {tab === "products" && data && (
        <Card title="Medicine-wise Sales">
          <Table rows={data} columns={[
            { key: "name", label: "Medicine" },
            { key: "qty_sold", label: "Qty Sold (base)" },
            { key: "revenue", label: "Revenue", render: (r) => money(r.revenue) },
            { key: "profit", label: "Profit", render: (r) => (
              <span className="text-emerald-600 font-semibold">{money(r.profit)}</span>
            )},
          ]} />
        </Card>
      )}

      {tab === "stock" && data && (
        <Card title="Stock Valuation">
          <Table rows={data} columns={[
            { key: "name", label: "Medicine" },
            { key: "category", label: "Category" },
            { key: "stock", label: "Stock", render: (r) => `${r.stock} ${r.base_unit}` },
            { key: "reorder_level", label: "Reorder Lvl" },
            { key: "cost_value", label: "Cost Value", render: (r) => money(r.cost_value) },
            { key: "mrp_value", label: "MRP Value", render: (r) => money(r.mrp_value) },
            { key: "status", label: "Status" },
          ]} />
        </Card>
      )}

      {tab === "expiry" && data && (
        <Card title="Expiry Report">
          <Table rows={data} columns={[
            { key: "medicine_name", label: "Medicine" },
            { key: "batch_no", label: "Batch" },
            { key: "exp_date", label: "Expiry" },
            { key: "days_left", label: "Days Left" },
            { key: "qty", label: "Qty" },
            { key: "value", label: "Value", render: (r) => money(r.value) },
            { key: "status", label: "Status" },
          ]} />
        </Card>
      )}

      {tab === "customers" && data && (
        <Card title="Top Customers">
          <Table rows={data} columns={[
            { key: "name", label: "Customer" },
            { key: "phone", label: "Phone" },
            { key: "orders", label: "Orders" },
            { key: "revenue", label: "Revenue", render: (r) => money(r.revenue) },
          ]} />
        </Card>
      )}

      {tab === "vendors" && data && (
        <Card title="Vendor Purchases">
          <Table rows={data} columns={[
            { key: "name", label: "Vendor" },
            { key: "invoices", label: "Invoices" },
            { key: "purchases", label: "Purchases", render: (r) => money(r.purchases) },
          ]} />
        </Card>
      )}
    </div>
  );
}