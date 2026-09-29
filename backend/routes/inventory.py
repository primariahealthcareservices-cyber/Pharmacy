from flask import Blueprint, request, jsonify
from datetime import date, timedelta
from extensions import db
from models import Medicine, Batch, StockAdjustment
from utils.auth import role_required
from utils.helpers import audit
from flask_jwt_extended import get_jwt_identity

inventory_bp = Blueprint("inventory", __name__)


@inventory_bp.get("/stock")
@role_required()
def stock_list():
    """Stock grouped by medicine with batch breakdown."""
    q = (request.args.get("q") or "").strip()
    query = Medicine.query.filter(Medicine.is_active.is_(True))
    if q:
        query = query.filter(Medicine.name.like(f"%{q}%"))
    meds = query.order_by(Medicine.name).limit(500).all()
    out = []
    for m in meds:
        batches = [b.to_dict() for b in m.batches if b.qty > 0]
        out.append({**m.to_dict(), "batches": batches})
    return jsonify(out)


@inventory_bp.get("/batches")
@role_required()
def batch_list():
    q = Batch.query.filter(Batch.qty > 0)
    if request.args.get("medicine_id"):
        q = q.filter(Batch.medicine_id == int(request.args["medicine_id"]))
    if request.args.get("expiring_days"):
        days = int(request.args["expiring_days"])
        q = q.filter(Batch.exp_date <= date.today() + timedelta(days=days))
    return jsonify([b.to_dict() for b in q.order_by(Batch.exp_date.asc()).limit(1000).all()])


@inventory_bp.get("/expiry")
@role_required()
def expiry_report():
    today = date.today()
    buckets = {
        "expired": [], "0_30": [], "31_60": [],
        "61_90": [], "91_180": [], "181_365": [],
    }
    for b in Batch.query.filter(Batch.qty > 0).all():
        if not b.exp_date:
            continue
        days = (b.exp_date - today).days
        d = b.to_dict()
        if days < 0:
            buckets["expired"].append({**d, "days_left": days})
        elif days <= 30:
            buckets["0_30"].append({**d, "days_left": days})
        elif days <= 60:
            buckets["31_60"].append({**d, "days_left": days})
        elif days <= 90:
            buckets["61_90"].append({**d, "days_left": days})
        elif days <= 180:
            buckets["91_180"].append({**d, "days_left": days})
        elif days <= 365:
            buckets["181_365"].append({**d, "days_left": days})
    return jsonify({
        "summary": {k: len(v) for k, v in buckets.items()},
        "buckets": buckets,
    })


@inventory_bp.get("/low-stock")
@role_required()
def low_stock():
    out = []
    for m in Medicine.query.filter(Medicine.is_active.is_(True)).all():
        stock = m.stock()
        if stock <= (m.reorder_level or 0):
            out.append({"id": m.id, "name": m.name, "stock": stock,
                        "reorder_level": m.reorder_level,
                        "suggested_order": max((m.max_level or 0) - stock, 0) or
                                           max((m.reorder_level or 0) * 2 - stock, 0)})
    return jsonify(out)


@inventory_bp.post("/adjust")
@role_required("super_admin", "admin", "inventory_manager", "pharmacist")
def adjust_stock():
    d = request.get_json() or {}
    batch = Batch.query.get(d.get("batch_id"))
    if not batch:
        return jsonify({"message": "Invalid batch"}), 400
    qty_change = int(d.get("qty_change") or 0)
    if qty_change == 0:
        return jsonify({"message": "qty_change cannot be zero"}), 400
    if batch.qty + qty_change < 0:
        return jsonify({"message": "Adjustment would make stock negative"}), 400

    batch.qty += qty_change
    adj = StockAdjustment(medicine_id=batch.medicine_id, batch_id=batch.id,
                          qty_change=qty_change, reason=d.get("reason", "count_error"),
                          notes=d.get("notes"), user_id=int(get_jwt_identity()))
    db.session.add(adj)
    audit("adjust", "batches", batch.id, None, {"qty_change": qty_change})
    db.session.commit()
    return jsonify(adj.to_dict()), 201


@inventory_bp.get("/adjustments")
@role_required()
def list_adjustments():
    return jsonify([a.to_dict() for a in
                    StockAdjustment.query.order_by(StockAdjustment.id.desc()).limit(300).all()])


@inventory_bp.get("/valuation")
@role_required()
def valuation():
    total_cost = 0.0
    total_mrp = 0.0
    count = 0
    for b in Batch.query.filter(Batch.qty > 0).all():
        total_cost += b.qty * (b.cost_price or 0)
        total_mrp += b.qty * (b.mrp or 0)
        count += 1
    return jsonify({"batches": count,
                    "cost_value": round(total_cost, 2),
                    "mrp_value": round(total_mrp, 2),
                    "potential_margin": round(total_mrp - total_cost, 2)})