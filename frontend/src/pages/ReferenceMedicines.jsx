import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import api from "../api/client";

const EMPTY = {
  company: "",
  product_name: "",
  pack: "",
  quantity: "",
  discount_offer: "",
};

// Column headers we accept in the Excel file (case-insensitive, spaces removed)
const EXCEL_KEYS = {
  COMPANY: "company",
  PRODUCTNAME: "product_name",
  PACK: "pack",
  QUANTITY: "quantity",
  DISCOUNTOFFER: "discount_offer",
};

export default function ReferenceMedicines() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");

  const fileInputRef = useRef(null);
  const [importing, setImporting] = useState(false);

  // ── Fetch ──
  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get("/reference-medicines");
      setItems(res.data || []);
    } catch (e) {
      console.error(e);
      setError(e?.response?.data?.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) =>
      [it.company, it.product_name, it.pack, it.discount_offer]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [items, search]);

  // ── Form helpers ──
  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setError("");
    setShowForm(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({
      company: item.company || "",
      product_name: item.product_name || "",
      pack: item.pack || "",
      quantity: item.quantity ?? "",
      discount_offer: item.discount_offer || "",
    });
    setError("");
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setForm(EMPTY);
    setError("");
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!form.company.trim() || !form.product_name.trim()) {
      setError("Company and Product Name are required");
      return;
    }

    const payload = {
      company: form.company.trim(),
      product_name: form.product_name.trim(),
      pack: form.pack.trim() || null,
      quantity: Number(form.quantity) || 0,
      discount_offer: form.discount_offer.trim() || null,
    };

    setSaving(true);
    try {
      if (editing) {
        await api.put(`/reference-medicines/${editing.id}`, payload);
      } else {
        await api.post("/reference-medicines", payload);
      }
      closeForm();
      await load();
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data?.message || "Failed to save. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete "${item.product_name}" (${item.company})?`)) return;
    try {
      await api.delete(`/reference-medicines/${item.id}`);
      await load();
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.message || "Failed to delete");
    }
  };

  // ── Excel Import ──
  const handleExcelClick = () => fileInputRef.current?.click();

  const normalizeRow = (row) => {
    // Convert arbitrary header names → our keys, case/space insensitive
    const out = { company: "", product_name: "", pack: "", quantity: 0, discount_offer: "" };
    Object.keys(row).forEach((rawKey) => {
      const clean = String(rawKey).toUpperCase().replace(/\s+/g, "");
      const mapped = EXCEL_KEYS[clean];
      if (mapped) out[mapped] = row[rawKey];
    });
    out.company = String(out.company ?? "").trim();
    out.product_name = String(out.product_name ?? "").trim();
    out.pack = String(out.pack ?? "").trim() || null;
    out.discount_offer = String(out.discount_offer ?? "").trim() || null;
    const q = parseInt(out.quantity, 10);
    out.quantity = Number.isFinite(q) ? q : 0;
    return out;
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so same file can be re-selected
    if (!file) return;

    setImporting(true);
    setError("");

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      if (!raw.length) {
        alert("The selected sheet is empty.");
        setImporting(false);
        return;
      }

      const rows = raw
        .map(normalizeRow)
        .filter((r) => r.company && r.product_name);

      if (!rows.length) {
        alert(
          "No valid rows found. Make sure the sheet has columns: COMPANY, PRODUCT NAME, PACK, QUANTITY, DISCOUNT OFFER"
        );
        setImporting(false);
        return;
      }

      const res = await api.post("/reference-medicines/bulk", { rows });
      const { inserted = 0, skipped = 0 } = res.data || {};

      alert(
        `Import complete.\nInserted: ${inserted}\nSkipped (duplicates/invalid): ${skipped}`
      );
      await load();
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.message || "Failed to import file.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Reference Medicine</h1>
          <p className="text-sm text-slate-500">
            Master list of company products with pack, quantity & discount offer.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            onClick={handleExcelClick}
            disabled={importing}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-medium shadow-sm"
          >
            {importing ? "Importing…" : "Import Excel"}
          </button>
          <button
            onClick={openCreate}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium shadow-sm"
          >
            + Add New Medicine
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by company, product, pack, offer…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md px-4 py-2 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-center px-4 py-3 font-semibold">#</th>
              <th className="text-center px-4 py-3 font-semibold">Company</th>
              <th className="text-center px-4 py-3 font-semibold">Product Name</th>
              <th className="text-center px-4 py-3 font-semibold">Pack</th>
              <th className="text-center px-4 py-3 font-semibold">Quantity</th>
              <th className="text-center px-4 py-3 font-semibold">Discount Offer</th>
              <th className="text-center px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="7" className="text-center py-8 text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan="7" className="text-center py-8 text-slate-400">
                  No records found.
                </td>
              </tr>
            ) : (
              filtered.map((it, idx) => (
                <tr
                  key={it.id}
                  className="border-t border-slate-100 hover:bg-slate-50"
                >
                  <td className="px-4 py-3 text-center text-slate-500">{idx + 1}</td>
                  <td className="px-4 py-3 text-center font-medium text-slate-800">
                    {it.company}
                  </td>
                  <td className="px-4 py-3 text-center text-slate-700">
                    {it.product_name}
                  </td>
                  <td className="px-4 py-3 text-center text-slate-700">
                    {it.pack || "—"}
                  </td>
                  <td className="px-4 py-3 text-center text-slate-700">
                    {it.quantity ?? 0}
                  </td>
                  <td className="px-4 py-3 text-center text-slate-700">
                    {it.discount_offer || "—"}
                  </td>
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    <button
                      onClick={() => openEdit(it)}
                      className="px-3 py-1.5 rounded-md bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700 text-xs font-medium mr-2"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(it)}
                      className="px-3 py-1.5 rounded-md bg-red-50 hover:bg-red-600 hover:text-white text-red-600 text-xs font-medium"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Form — compact like the Medicines page */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-8">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
              <h2 className="text-base font-semibold text-slate-800">
                {editing ? "Edit Reference Medicine" : "Add New Medicine"}
              </h2>
              <button
                onClick={closeForm}
                className="text-slate-400 hover:text-slate-700 text-xl leading-none"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
              {error && (
                <div className="bg-red-50 text-red-700 text-xs px-3 py-2 rounded-md">
                  {error}
                </div>
              )}

              {/* Row 1: Company + Product Name */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Company <span className="text-red-500">*</span>
                  </label>
                  <input
                    name="company"
                    value={form.company}
                    onChange={handleChange}
                    placeholder="e.g. Cipla Ltd"
                    className="w-full px-3 py-1.5 rounded-md border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Product Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    name="product_name"
                    value={form.product_name}
                    onChange={handleChange}
                    placeholder="e.g. Paracetamol 500mg"
                    className="w-full px-3 py-1.5 rounded-md border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm"
                    required
                  />
                </div>
              </div>

              {/* Row 2: Pack + Quantity */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Pack
                  </label>
                  <input
                    name="pack"
                    value={form.pack}
                    onChange={handleChange}
                    placeholder="e.g. 10x10, 1x100ml"
                    className="w-full px-3 py-1.5 rounded-md border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min="0"
                    name="quantity"
                    value={form.quantity}
                    onChange={handleChange}
                    placeholder="0"
                    className="w-full px-3 py-1.5 rounded-md border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm"
                  />
                </div>
              </div>

              {/* Row 3: Discount Offer (full width) */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Discount Offer
                </label>
                <input
                  name="discount_offer"
                  value={form.discount_offer}
                  onChange={handleChange}
                  placeholder="e.g. 10+1, 5% off, Buy 2 Get 1"
                  className="w-full px-3 py-1.5 rounded-md border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeForm}
                  className="px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium shadow-sm"
                >
                  {saving ? "Saving…" : editing ? "Update" : "Add Medicine"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}