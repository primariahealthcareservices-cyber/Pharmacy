import { useEffect, useState } from "react";
import api, { money } from "../api/client";
import { Card, Stat, Badge } from "../components/ui";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend,
} from "recharts";

const COLORS = ["#059669", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6"];

export default function Dashboard() {
  const [s, setS] = useState(null);
  const [charts, setCharts] = useState(null);

  useEffect(() => {
    api.get("/dashboard/summary").then((r) => setS(r.data));
    api.get("/dashboard/charts").then((r) => setCharts(r.data));
  }, []);

  if (!s) return <p className="text-slate-500">Loading dashboard…</p>;

  const modeData = Object.entries(s.collections_today || {}).map(([k, v]) => ({ name: k, value: v }));

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Badge tone="green">{new Date().toDateString()}</Badge>
      </div>

      {/* Row 1 — Today */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <Stat label="Today's Sales" value={money(s.today.sales)} tone="green" />
        <Stat label="Today's Profit" value={money(s.today.profit)} tone="blue" />
        <Stat label="Today's Purchases" value={money(s.today.purchases)} tone="amber" />
        <Stat label="Today's Expenses" value={money(s.today.expenses)} tone="red" />
      </div>

      {/* Row 2 — Month + Stock */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <Stat label="Month Revenue" value={money(s.month.revenue)} tone="green" />
        <Stat label="Month Net Profit" value={money(s.month.net_profit)} tone="violet"
              sub={`Expenses ${money(s.month.expenses)}`} />
        <Stat label="Stock Value (Cost)" value={money(s.stock.total_value)} tone="slate"
              sub={`${s.stock.total_products} products`} />
        <Stat label="Pending Payments" value={money(s.pending.customer_payments)} tone="amber"
              sub={`Vendor due ${money(s.pending.vendor_payments)}`} />
      </div>

      {/* Row 3 — Alerts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card title="🔴 Expired Batches">
          <p className="text-3xl font-bold text-red-600">{s.stock.expired}</p>
        </Card>
        <Card title="🟠 Expiring in 30 days">
          <p className="text-3xl font-bold text-amber-600">{s.stock.expiring_30}</p>
        </Card>
        <Card title="🟡 Low Stock Products">
          <p className="text-3xl font-bold text-yellow-600">{s.stock.low_stock}</p>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Card title="Revenue & Profit (30 days)" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={charts?.daily || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }}
                     tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => money(v)} />
              <Legend />
              <Line type="monotone" dataKey="revenue" stroke="#059669" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="profit" stroke="#3b82f6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Collections Today">
          {modeData.length === 0 ? (
            <p className="text-slate-400 text-sm py-10 text-center">No collections yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={modeData} dataKey="value" nameKey="name" outerRadius={90} label>
                  {modeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => money(v)} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Purchase vs Sales (30 days)">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={charts?.daily || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => money(v)} />
              <Legend />
              <Bar dataKey="revenue" fill="#059669" radius={[4, 4, 0, 0]} />
              <Bar dataKey="purchases" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Top Selling Medicines (30 days)">
          {s.top_selling.length === 0 ? (
            <p className="text-slate-400 text-sm py-10 text-center">No sales yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={s.top_selling} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="qty" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>
    </div>
  );
}