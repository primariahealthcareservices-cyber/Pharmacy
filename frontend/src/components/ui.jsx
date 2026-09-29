import { useEffect } from "react";

export function Card({ title, action, children, className = "" }) {
  return (
    <div className={`card ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-700">{title}</h3>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function Stat({ label, value, sub, tone = "slate" }) {
  const tones = {
    slate: "text-slate-800",
    green: "text-emerald-600",
    red: "text-red-600",
    amber: "text-amber-600",
    blue: "text-blue-600",
    violet: "text-violet-600",
  };
  return (
    <div className="card">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${tones[tone]}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div className={`bg-white rounded-xl shadow-xl w-full ${wide ? "max-w-4xl" : "max-w-lg"} my-8`}>
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

export function Input(props) {
  return <input {...props} className={`input ${props.className || ""}`} />;
}

export function Select({ children, ...props }) {
  return <select {...props} className={`input ${props.className || ""}`}>{children}</select>;
}

export function Button({ variant = "primary", className = "", ...props }) {
  const v = { primary: "btn-primary", secondary: "btn-secondary", danger: "btn-danger" }[variant];
  return <button {...props} className={`btn ${v} ${className}`} />;
}

export function Table({ columns, rows, empty = "No records", keyField = "id" }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>{columns.map((c) => <th key={c.key} className="th">{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={columns.length} className="td text-center text-slate-400 py-8">{empty}</td></tr>
          )}
          {rows.map((r, i) => (
            <tr key={r[keyField] ?? i} className="hover:bg-slate-50">
              {columns.map((c) => (
                <td key={c.key} className="td">
                  {c.render ? c.render(r) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Badge({ children, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-emerald-100 text-emerald-700",
    red: "bg-red-100 text-red-700",
    amber: "bg-amber-100 text-amber-700",
    blue: "bg-blue-100 text-blue-700",
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}