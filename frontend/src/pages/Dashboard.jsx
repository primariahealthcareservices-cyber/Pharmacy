import { useEffect, useState } from "react";
import api, { money } from "../api/client";
import { Card, Stat, Badge } from "../components/ui";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend,
} from "recharts";

const COLORS = ["#059669", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6"];

// 🆕 Safe defaults so a partial/empty response never crashes the page
const EMPTY_TODAY = { sales: 0, profit: 0, purchases: 0, expenses: 0 };
const EMPTY_MONTH = { revenue: 0, net_profit: 0, expenses: 0 };
const EMPTY_STOCK = {
  total_value: 0, total_products: 0,
  expired: 0, expiring_30: 0, low_stock: 0,
};
const EMPTY_PENDING = { customer_payments: 0, vendor_payments: 0 };

export default function Dashboard() {
  const [s, setS] = useState(null);
  const [charts, setCharts] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/dashboard/summary")
      .then((r) => {
        console.log("dashboard/summary:", r.data);   // 🆕 debug
        setS(r.data);
      })
      .catch((err) => {
        console.error("dashboard/summary failed:", err.response?.data || err.message);
        setError("Failed to load dashboard summary.");
      });

    api.get("/dashboard/charts")
      .then((r) => setCharts(r.data))
      .catch((err) => {
        console.error("dashboard/charts failed:", err.response?.data || err.message);
      });
  }, []);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!s) return <p className="text-slate-500">Loading dashboard…</p>;

  // 🆕 Merge with safe defaults — works even if backend omits a key
  const today = { ...EMPTY_TODAY, ...(s.today || {}) };
  const month = { ...EMPTY_MONTH, ...(s.month || {}) };
  const stock = { ...EMPTY_STOCK, ...(s.stock || {}) };
  const pending = { ...EMPTY_PENDING, ...(s.pending || {}) };
  const topSelling = Array.isArray(s.top_selling) ? s.top_selling : [];
  const collectionsToday = s.collections_today || {};

  const modeData = Object.entries(collectionsToday).map(([k, v]) => ({
    name: k,
    value: v,
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Badge tone="green">{new Date().toDateString()}</Badge>
      </div>

      {/* Row 1 — Today */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <Stat label="Today's Sales" value={money(today.sales)} tone="green" />
        <Stat label="Today's Profit" value={money(today.profit)} tone="blue" />
        <Stat label="Today's Purchases" value={money(today.purchases)} tone="amber" />
        <Stat label="Today's Expenses" value={money(today.expenses)} tone="red" />
      </div>

      {/* Row 2 — Month + Stock */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <Stat label="Month Revenue" value={money(month.revenue)} tone="green" />
        <Stat label="Month Net Profit" value={money(month.net_profit)} tone="violet"
              sub={`Expenses ${money(month.expenses)}`} />
        <Stat label="Stock Value (Cost)" value={money(stock.total_value)} tone="slate"
              sub={`${stock.total_products} products`} />
        <Stat label="Pending Payments" value={money(pending.customer_payments)} tone="amber"
              sub={`Vendor due ${money(pending.vendor_payments)}`} />
      </div>

      {/* Row 3 — Alerts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card title="🔴 Expired Batches">
          <p className="text-3xl font-bold text-red-600">{stock.expired}</p>
        </Card>
        <Card title="🟠 Expiring in 30 days">
          <p className="text-3xl font-bold text-amber-600">{stock.expiring_30}</p>
        </Card>
        <Card title="🟡 Low Stock Products">
          <p className="text-3xl font-bold text-yellow-600">{stock.low_stock}</p>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Card title="Revenue & Profit (30 days)" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={charts?.daily || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }}
                     tickFormatter={(v) => String(v).slice(5)} />
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
              <XAxis dataKey="date" tick={{ fontSize: 11 }}
                     tickFormatter={(v) => String(v).slice(5)} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => money(v)} />
              <Legend />
              <Bar dataKey="revenue" fill="#059669" radius={[4, 4, 0, 0]} />
              <Bar dataKey="purchases" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Top Selling Medicines (30 days)">
          {topSelling.length === 0 ? (
            <p className="text-slate-400 text-sm py-10 text-center">No sales yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={topSelling} layout="vertical">
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