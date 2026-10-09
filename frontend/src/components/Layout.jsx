import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const NAV = [
  { to: "/", label: "Dashboard", icon: "📊" },
  { to: "/pos", label: "POS / Billing", icon: "🧾" },
  { to: "/sales", label: "Sales", icon: "💰" },
  { to: "/purchases", label: "Purchases", icon: "📦" },
  { to: "/inventory", label: "Inventory", icon: "🏷️" },
  { to: "/medicines", label: "Medicines", icon: "💊" },
  { to: "/manufacturers", label: "Distributors", icon: "🏭" },
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
    <div className="flex h-screen bg-slate-50">
      {/* ── Sidebar ── */}
      <aside className="w-60 bg-white text-slate-700 flex flex-col border-r border-slate-200 shadow-sm">
        {/* Logo header */}
        <div className="px-4 py-4 border-b border-slate-200 flex flex-col items-center">
          <img
            src="/primaria.png"
            alt="Primaria Health Care"
            className="h-16 w-auto object-contain mb-3"
          />
          {/* <p className="text-xs text-slate-600 font-medium">{user?.name}</p>
          <p className="text-[10px] uppercase tracking-wide text-slate-400">
            {user?.role}
          </p> */}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2">
          {NAV.filter((n) => !n.roles || hasRole(...n.roles)).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition-colors rounded-md mx-2 ${
                  isActive
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                }`
              }
            >
              {n.icon && <span>{n.icon}</span>}
              {n.label}
            </NavLink>
          ))}
        </nav>

        {/* Logout */}
        <button
          onClick={() => {
            logout();
            navigate("/login");
          }}
          className="m-3 py-2 rounded-lg bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700 text-sm transition-colors"
        >
          Logout
        </button>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-[1500px] mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}