from datetime import datetime
from flask import Blueprint, request, jsonify
from sqlalchemy import or_
from extensions import db
from models import (
    Medicine, Batch, Category,
    SIMPLE_UNIT_TYPES, default_unit_for_type,
)
from utils.auth import role_required
from utils.helpers import audit, parse_date

medicines_bp = Blueprint("medicines", __name__)

FIELDS = [
    "sku", "barcode", "name", "generic_name", "brand_name",
    "category_id", "manufacturer_id",
    "medicine_type", "dosage_form", "strength",
    "composition", "pack_type", "description", "hsn_code", "is_prescription",
    "base_unit", "units_per_strip", "strips_per_box",
    "gst_rate", "mrp", "cost_price", "selling_price", "wholesale_price",
    "min_selling_price",
    "reorder_level", "max_level", "rack_location", "is_active",
]

INT_FIELDS = {
    "category_id", "manufacturer_id",
    "units_per_strip", "strips_per_box", "reorder_level", "max_level",
}
FK_FIELDS = {"category_id", "manufacturer_id"}
FLOAT_FIELDS = {
    "gst_rate", "mrp", "cost_price", "selling_price",
    "wholesale_price", "min_selling_price",
}
BOOL_FIELDS = {"is_prescription", "is_active"}
PACK_FIELDS = {"units_per_strip", "strips_per_box"}


def _to_int(v, default=0):
    try:
        if v in (None, ""):
            return default
        return int(float(v))
    except (TypeError, ValueError):
        return default


def _to_bool(v):
    if isinstance(v, bool):
        return v
    if v in (None, ""):
        return False
    return str(v).strip().lower() in ("1", "true", "yes", "on")


def _coerce(data):
    out = {}
    for f in FIELDS:
        if f not in data:
            continue
        v = data[f]
        if isinstance(v, str) and v.strip() == "":
            v = None
        if f in FK_FIELDS:
            v = None if v in (None, "") else _to_int(v, None)
        elif f in PACK_FIELDS:
            v = max(1, _to_int(v, 1))
        elif f in INT_FIELDS:
            v = _to_int(v, 0)
        elif f in FLOAT_FIELDS:
            try:
                v = 0.0 if v in (None, "") else float(v)
            except (TypeError, ValueError):
                v = 0.0
        elif f in BOOL_FIELDS:
            v = _to_bool(v)
        out[f] = v
    return out


def _to_num(v, fallback=0.0):
    try:
        return float(v if v not in (None, "") else fallback)
    except (TypeError, ValueError):
        return float(fallback or 0)


def _ensure_category(data):
    """Resolve category_id from category_name; create if missing."""
    cid = data.get("category_id")
    if cid not in (None, ""):
        return _to_int(cid, None)
    cname = (data.get("category_name") or "").strip()
    if not cname:
        return None
    cat = Category.query.filter(Category.name.ilike(cname)).first()
    if not cat:
        cat = Category(name=cname)
        db.session.add(cat)
        db.session.flush()
    return cat.id


# ─────────── PACKAGING → BASE UNIT CONVERSION ───────────
def _norm_unit(u):
    u = (u or "base").strip().lower()
    if u in ("strip", "box"):
        return u
    return "base"


def _to_base_units(entry_qty, entry_unit, m):
    qty = _to_int(entry_qty, 0)
    if qty <= 0:
        return 0
    if getattr(m, "is_simple_unit", False):
        return qty
    ups = max(1, _to_int(m.units_per_strip, 1))
    spb = max(1, _to_int(m.strips_per_box, 1))
    unit = _norm_unit(entry_unit)
    if unit == "box":
        return qty * spb * ups
    if unit == "strip":
        return qty * ups
    return qty


def _make_batch(m, d):
    entry_unit = _norm_unit(d.get("entry_unit"))
    entry_qty = d.get("entry_qty")

    if entry_qty is None:
        entry_qty = d.get("qty") or 0
        entry_unit = "base"

    entry_qty = _to_int(entry_qty, 0)
    base_qty = _to_base_units(entry_qty, entry_unit, m)
    if base_qty <= 0:
        return None

    return Batch(
        medicine_id=m.id,
        vendor_id=d.get("vendor_id"),
        batch_no=(d.get("batch_no") or "OPENING").strip() or "OPENING",
        mfg_date=parse_date(d.get("mfg_date")),
        exp_date=parse_date(d.get("exp_date")),
        cost_price=_to_num(d.get("cost_price"), m.cost_price),
        mrp=_to_num(d.get("mrp"), m.mrp),
        selling_price=_to_num(d.get("selling_price"), m.selling_price),
        gst_rate=_to_num(d.get("gst_rate"), m.gst_rate or 12),
        qty=base_qty,
        initial_qty=base_qty,
        free_qty=_to_int(d.get("free_qty"), 0),
        entry_qty=entry_qty,
        entry_unit=entry_unit,
    )


def _resync_batches(m):
    if getattr(m, "is_simple_unit", False):
        return
    for b in m.batches:
        if not b.entry_qty or _norm_unit(b.entry_unit) == "base":
            continue
        new_base = _to_base_units(b.entry_qty, b.entry_unit, m)
        old_base = b.initial_qty or 0
        if new_base != old_base:
            b.qty = max(0, (b.qty or 0) + (new_base - old_base))
            b.initial_qty = new_base


def _apply_simple_type_defaults(clean):
    mtype = clean.get("medicine_type")
    if mtype in SIMPLE_UNIT_TYPES:
        clean["units_per_strip"] = 1
        clean["strips_per_box"] = 1
        bu = clean.get("base_unit")
        if not bu or bu in ("tablet", "capsule", "strip", "box"):
            clean["base_unit"] = default_unit_for_type(mtype)


# ───── LIST ─────
@medicines_bp.get("")
@role_required()
def list_medicines():
    q = (request.args.get("q") or "").strip()
    query = Medicine.query
    if q:
        like = f"%{q}%"
        query = query.filter(or_(
            Medicine.name.like(like),
            Medicine.generic_name.like(like),
            Medicine.sku.like(like),
            Medicine.barcode.like(like),
            Medicine.brand_name.like(like),
        ))
    if request.args.get("category_id"):
        query = query.filter(Medicine.category_id == int(request.args["category_id"]))
    if request.args.get("manufacturer_id"):
        query = query.filter(Medicine.manufacturer_id == int(request.args["manufacturer_id"]))
    if request.args.get("active_only") == "1":
        query = query.filter(Medicine.is_active.is_(True))

    items = query.order_by(Medicine.name).limit(1000).all()
    data = [m.to_dict() for m in items]
    if request.args.get("low_stock") == "1":
        data = [d for d in data if d["low_stock"]]
    return jsonify(data)


# ───── CREATE ─────
@medicines_bp.post("")
@role_required("super_admin", "admin", "inventory_manager")
def create_medicine():
    d = request.get_json(silent=True) or {}
    print("[/api/medicines POST] payload =", d)

    if not d.get("name"):
        return jsonify({"message": "name is required"}), 400

    # pull batch_data from a COPY so `d` keeps category_name etc.
    batch_data = d.get("initial_batch") or {}
    clean = _coerce(d)

    # resolve category_name → category_id
    cat_id = _ensure_category(d)
    if cat_id is not None:
        clean["category_id"] = cat_id

    if clean.get("base_unit") in ("strip", "box"):
        clean["base_unit"] = "tablet"

    _apply_simple_type_defaults(clean)

    m = Medicine()
    for k, v in clean.items():
        setattr(m, k, v)
    if not m.sku:
        last = Medicine.query.order_by(Medicine.id.desc()).first()
        m.sku = f"MED{((last.id if last else 0) + 1):05d}"

    try:
        db.session.add(m)
        db.session.flush()
        b = _make_batch(m, batch_data)
        if b:
            db.session.add(b)
        audit("create", "medicines", m.id, None, clean)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        import traceback
        traceback.print_exc()
        return jsonify({
            "message": "Failed to create medicine",
            "error": str(e),
            "type": type(e).__name__,
        }), 400
    return jsonify(m.to_dict()), 201


# ───── GET ONE ─────
@medicines_bp.get("/<int:mid>")
@role_required()
def get_medicine(mid):
    m = Medicine.query.get_or_404(mid)
    d = m.to_dict()
    d["batches"] = [b.to_dict() for b in m.batches if b.qty > 0]
    return jsonify(d)


# ───── UPDATE MASTER ─────
@medicines_bp.put("/<int:mid>")
@role_required("super_admin", "admin", "inventory_manager")
def update_medicine(mid):
    m = Medicine.query.get_or_404(mid)
    old = m.to_dict(False)
    d = request.get_json(silent=True) or {}
    print(f"[/api/medicines PUT {mid}] payload =", d)

    clean = _coerce(d)

    cat_id = _ensure_category(d)
    if cat_id is not None:
        clean["category_id"] = cat_id

    if clean.get("base_unit") in ("strip", "box"):
        clean["base_unit"] = "tablet"

    if "medicine_type" in clean:
        _apply_simple_type_defaults(clean)

    pack_changed = any(
        k in clean and clean[k] != getattr(m, k) for k in PACK_FIELDS
    )

    for k, v in clean.items():
        setattr(m, k, v)

    try:
        if pack_changed:
            _resync_batches(m)
        audit("update", "medicines", mid, old, clean)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        import traceback
        traceback.print_exc()
        return jsonify({
            "message": "Failed to update medicine",
            "error": str(e),
            "type": type(e).__name__,
        }), 400
    return jsonify(m.to_dict())


# ───── DELETE ─────
@medicines_bp.delete("/<int:mid>")
@role_required("super_admin", "admin")
def delete_medicine(mid):
    m = Medicine.query.get_or_404(mid)
    try:
        audit("delete", "medicines", mid, m.to_dict(False))
        db.session.delete(m)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({
            "message": "Cannot delete medicine — it may be referenced by sales, purchases, or stock records.",
            "error": str(e),
        }), 409
    return jsonify({"message": "deleted"})


# ───── LIST BATCHES ─────
@medicines_bp.get("/<int:mid>/batches")
@role_required()
def medicine_batches(mid):
    batches = (
        Batch.query
        .filter(Batch.medicine_id == mid, Batch.qty > 0)
        .order_by(Batch.exp_date.asc())
        .all()
    )
    return jsonify([b.to_dict() for b in batches])


# ───── ADD BATCH ─────
@medicines_bp.post("/<int:mid>/batches")
@role_required("super_admin", "admin", "inventory_manager")
def add_batch(mid):
    m = Medicine.query.get_or_404(mid)
    d = request.get_json(silent=True) or {}
    b = _make_batch(m, d)
    if not b:
        return jsonify({"message": "qty must be greater than 0"}), 400
    try:
        db.session.add(b)
        db.session.flush()
        audit("create", "batches", b.id, None, d)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"message": "Failed to add batch", "error": str(e)}), 400
    return jsonify(m.to_dict()), 201


# ───── UPDATE BATCH ─────
@medicines_bp.put("/<int:mid>/batches/<int:bid>")
@role_required("super_admin", "admin", "inventory_manager")
def update_batch(mid, bid):
    m = Medicine.query.get_or_404(mid)
    b = Batch.query.filter_by(id=bid, medicine_id=m.id).first_or_404()
    d = request.get_json(silent=True) or {}

    if "entry_qty" in d or "entry_unit" in d:
        new_unit = _norm_unit(d.get("entry_unit") or b.entry_unit)
        new_entry = _to_int(d.get("entry_qty", b.entry_qty), 0)
        new_base = _to_base_units(new_entry, new_unit, m)

        if b.entry_qty:
            old_base = _to_base_units(b.entry_qty, b.entry_unit, m)
            b.qty = max(0, (b.qty or 0) + (new_base - old_base))
            b.initial_qty = new_base
        else:
            b.qty = new_base
            b.initial_qty = max(b.initial_qty or 0, new_base)

        b.entry_qty = new_entry
        b.entry_unit = new_unit
    elif "qty" in d:
        new_qty = _to_int(d["qty"], b.qty or 0)
        b.qty = max(0, new_qty)
        b.initial_qty = max(b.initial_qty or 0, b.qty)
        b.entry_qty = b.qty
        b.entry_unit = "base"

    if "batch_no" in d and d["batch_no"]:
        b.batch_no = str(d["batch_no"]).strip()
    if "mfg_date" in d:
        b.mfg_date = parse_date(d["mfg_date"])
    if "exp_date" in d:
        b.exp_date = parse_date(d["exp_date"])
    if "cost_price" in d:
        b.cost_price = _to_num(d["cost_price"], b.cost_price)
    if "mrp" in d:
        b.mrp = _to_num(d["mrp"], b.mrp)
    if "selling_price" in d:
        b.selling_price = _to_num(d["selling_price"], b.selling_price)
    if "gst_rate" in d:
        b.gst_rate = _to_num(d["gst_rate"], b.gst_rate)

    try:
        audit("update", "batches", b.id, None, d)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"message": "Failed to update batch", "error": str(e)}), 400
    return jsonify(b.to_dict())


# ───── DELETE BATCH ─────
@medicines_bp.delete("/<int:mid>/batches/<int:bid>")
@role_required("super_admin", "admin")
def delete_batch(mid, bid):
    m = Medicine.query.get_or_404(mid)
    b = Batch.query.filter_by(id=bid, medicine_id=m.id).first_or_404()
    audit("delete", "batches", b.id, b.to_dict())
    db.session.delete(b)
    db.session.commit()
    return jsonify({"message": "deleted"})


# ───── POS SEARCH ─────
@medicines_bp.get("/search/pos")
@role_required()
def pos_search():
    q = (request.args.get("q") or "").strip()
    if not q:
        return jsonify([])
    like = f"%{q}%"
    meds = (
        Medicine.query
        .filter(Medicine.is_active.is_(True))
        .filter(or_(
            Medicine.name.like(like),
            Medicine.generic_name.like(like),
            Medicine.barcode == q,
            Medicine.sku == q,
        ))
        .limit(20).all()
    )
    out = []
    for m in meds:
        batches = [b.to_dict() for b in m.batches if b.qty > 0]
        batches.sort(key=lambda b: (b["exp_date"] or "9999"))
        out.append({**m.to_dict(), "available_batches": batches})
    return jsonify(out)