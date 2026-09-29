import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const NAV = [
  { to: "/", label: "Dashboard", icon: "📊" },
  { to: "/pos", label: "POS / Billing", icon: "🧾" },
  { to: "/sales", label: "Sales", icon: "💰" },
  { to: "/purchases", label: "Purchases", icon: "📦" },
  { to: "/inventory", label: "Inventory", icon: "🏷️" },
  { to: "/medicines", label: "Medicines", icon: "💊" },
  { to: "/manufacturers", label: "Manufacturers", icon: "🏭" },
  { to: "/vendors", label: "Vendors", icon: "🚚" },
  { to: "/customers", label: "Customers", icon: "👥" },
  { to: "/expenses", label: "Expenses", icon: "🧮" },
  { to: "/payments", label: "Payments", icon: "💳" },
  { to: "/reports", label: "Reports", icon: "📈" },
  { to: "/users", label: "Users", icon: "🔐", roles: ["super_admin", "admin"] },
];

export default function Layout() {
  const { user, logout, hasRole } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex h-screen">
      <aside className="w-60 bg-slate-900 text-slate-200 flex flex-col">
        <div className="px-5 py-4 border-b border-slate-800">
          <h1 className="text-lg font-bold text-emerald-400">💊 Pharmacy ERP</h1>
          <p className="text-xs text-slate-400 mt-0.5">{user?.name}</p>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">{user?.role}</p>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {NAV.filter((n) => !n.roles || hasRole(...n.roles)).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-5 py-2.5 text-sm transition ${
                  isActive
                    ? "bg-emerald-600/20 text-emerald-300 border-r-2 border-emerald-400"
                    : "hover:bg-slate-800"
                }`
              }
            >
              <span>{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={() => { logout(); navigate("/login"); }}
          className="m-3 py-2 rounded-lg bg-slate-800 hover:bg-red-600 text-sm transition"
        >
          Logout
        </button>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-[1500px] mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}