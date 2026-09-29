from flask import Blueprint, request, jsonify
from sqlalchemy import or_
from extensions import db
from models import Medicine, Batch
from utils.auth import role_required
from utils.helpers import audit, parse_date

medicines_bp = Blueprint("medicines", __name__)

FIELDS = ["sku", "barcode", "name", "generic_name", "brand_name", "category_id",
          "manufacturer_id", "medicine_type", "dosage_form", "strength",
          "composition", "pack_type", "description", "hsn_code", "is_prescription",
          "base_unit", "units_per_strip", "strips_per_box", "gst_rate", "mrp",
          "cost_price", "selling_price", "wholesale_price", "min_selling_price",
          "reorder_level", "max_level", "rack_location", "is_active"]


@medicines_bp.get("")
@role_required()
def list_medicines():
    q = (request.args.get("q") or "").strip()
    query = Medicine.query
    if q:
        like = f"%{q}%"
        query = query.filter(or_(Medicine.name.like(like),
                                 Medicine.generic_name.like(like),
                                 Medicine.sku.like(like),
                                 Medicine.barcode.like(like),
                                 Medicine.brand_name.like(like)))
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


@medicines_bp.post("")
@role_required("super_admin", "admin", "inventory_manager")
def create_medicine():
    d = request.get_json() or {}
    if not d.get("name"):
        return jsonify({"message": "name is required"}), 400
    m = Medicine()
    for f in FIELDS:
        if f in d:
            setattr(m, f, d[f])
    if not m.sku:
        last = Medicine.query.order_by(Medicine.id.desc()).first()
        m.sku = f"MED{((last.id if last else 0) + 1):05d}"
    db.session.add(m)
    db.session.flush()
    audit("create", "medicines", m.id, None, d)
    db.session.commit()
    return jsonify(m.to_dict()), 201


@medicines_bp.get("/<int:mid>")
@role_required()
def get_medicine(mid):
    m = Medicine.query.get_or_404(mid)
    d = m.to_dict()
    d["batches"] = [b.to_dict() for b in m.batches if b.qty > 0]
    return jsonify(d)


@medicines_bp.put("/<int:mid>")
@role_required("super_admin", "admin", "inventory_manager")
def update_medicine(mid):
    m = Medicine.query.get_or_404(mid)
    old = m.to_dict(False)
    d = request.get_json() or {}
    for f in FIELDS:
        if f in d:
            setattr(m, f, d[f])
    audit("update", "medicines", mid, old, d)
    db.session.commit()
    return jsonify(m.to_dict())


@medicines_bp.delete("/<int:mid>")
@role_required("super_admin", "admin")
def delete_medicine(mid):
    m = Medicine.query.get_or_404(mid)
    audit("delete", "medicines", mid, m.to_dict(False))
    db.session.delete(m)
    db.session.commit()
    return jsonify({"message": "deleted"})


@medicines_bp.get("/<int:mid>/batches")
@role_required()
def medicine_batches(mid):
    """FIFO order by expiry — used by POS."""
    batches = (Batch.query.filter(Batch.medicine_id == mid, Batch.qty > 0)
               .order_by(Batch.exp_date.asc()).all())
    return jsonify([b.to_dict() for b in batches])


@medicines_bp.get("/search/pos")
@role_required()
def pos_search():
    """Fast POS search: returns medicine + available batches."""
    q = (request.args.get("q") or "").strip()
    if not q:
        return jsonify([])
    like = f"%{q}%"
    meds = (Medicine.query
            .filter(Medicine.is_active.is_(True))
            .filter(or_(Medicine.name.like(like), Medicine.generic_name.like(like),
                        Medicine.barcode == q, Medicine.sku == q))
            .limit(20).all())
    out = []
    for m in meds:
        batches = [b.to_dict() for b in m.batches if b.qty > 0]
        batches.sort(key=lambda b: (b["exp_date"] or "9999"))
        out.append({**m.to_dict(), "available_batches": batches})
    return jsonify(out)