from flask import Blueprint, request, jsonify
from datetime import datetime
from sqlalchemy import or_
from extensions import db
from models import (Purchase, PurchaseItem, PurchaseReturn, PurchaseReturnItem,
                    Batch, Medicine, Vendor, VendorPayment)
from utils.auth import role_required
from utils.helpers import audit, parse_date
from flask_jwt_extended import get_jwt_identity

purchases_bp = Blueprint("purchases", __name__)


# ─────────── helpers ───────────
def _to_int(v, default=0):
    try:
        if v in (None, ""):
            return default
        return int(float(v))
    except (TypeError, ValueError):
        return default


def _to_num(v, default=0.0):
    try:
        if v in (None, ""):
            return default
        return float(v)
    except (TypeError, ValueError):
        return default


def _norm_unit(u):
    u = (u or "base").lower()
    return u if u in ("box", "strip") else "base"


def _factor(med, unit):
    """How many base units in 1 of the given purchase unit."""
    ups = max(1, int(med.units_per_strip or 1))
    spb = max(1, int(med.strips_per_box or 1))
    unit = _norm_unit(unit)
    if unit == "box":
        return ups * spb
    if unit == "strip":
        return ups
    return 1


# ───────── LIST ─────────
@purchases_bp.get("")
@role_required()
def list_purchases():
    q = (request.args.get("q") or "").strip()
    query = Purchase.query.join(Vendor, Purchase.vendor_id == Vendor.id)

    if q:
        like = f"%{q}%"
        query = query.filter(or_(
            Purchase.invoice_no.like(like),
            Vendor.name.like(like),
            Purchase.notes.like(like),
        ))

    if request.args.get("vendor_id"):
        query = query.filter(Purchase.vendor_id == int(request.args["vendor_id"]))
    if request.args.get("from"):
        query = query.filter(Purchase.invoice_date >= parse_date(request.args["from"]))
    if request.args.get("to"):
        query = query.filter(Purchase.invoice_date <= parse_date(request.args["to"]))
    if request.args.get("status"):
        query = query.filter(Purchase.status == request.args["status"])

    return jsonify([p.to_dict() for p in
                    query.order_by(Purchase.id.desc()).limit(500).all()])


# ───────── GET ONE ─────────
@purchases_bp.get("/<int:pid>")
@role_required()
def get_purchase(pid):
    return jsonify(Purchase.query.get_or_404(pid).to_dict())


# ───────── CREATE ─────────
@purchases_bp.post("")
@role_required("super_admin", "admin", "inventory_manager", "purchase_manager")
def create_purchase():
    d = request.get_json(silent=True) or {}

    vendor = Vendor.query.get(d.get("vendor_id"))
    if not vendor:
        return jsonify({"message": "Invalid vendor"}), 400

    items = d.get("items") or []
    if not items:
        return jsonify({"message": "At least one item is required"}), 400

    invoice_no = (d.get("invoice_no") or "").strip()
    if not invoice_no:
        last = Purchase.query.order_by(Purchase.id.desc()).first()
        invoice_no = f"PUR{((last.id if last else 0) + 1):05d}"

    p = Purchase(
        invoice_no=invoice_no,
        vendor_id=vendor.id,
        invoice_date=parse_date(d.get("invoice_date")) or datetime.utcnow().date(),
        received_date=parse_date(d.get("received_date")) or datetime.utcnow().date(),
        discount=_to_num(d.get("discount"), 0),
        notes=d.get("notes"),
        user_id=int(get_jwt_identity()),
    )
    db.session.add(p)
    db.session.flush()

    sub_total = 0.0
    tax_total = 0.0

    for it in items:
        med = Medicine.query.get(it.get("medicine_id"))
        if not med:
            continue

        unit = _norm_unit(it.get("unit"))
        factor = _factor(med, unit)

        qty_in = _to_int(it.get("quantity"), 0)
        free_in = _to_int(it.get("free_qty"), 0)

        if qty_in <= 0:
            continue

        qty_base = qty_in * factor
        free_base = free_in * factor
        total_units = qty_base + free_base

        cost_base = _to_num(it.get("cost_price"), med.cost_price or 0)
        mrp_base = _to_num(it.get("mrp"), med.mrp or 0)
        sell_base = _to_num(it.get("selling_price"), med.selling_price or 0)
        gst = _to_num(it.get("gst_rate"), med.gst_rate or 12)
        disc_pct = _to_num(it.get("discount_percent"), 0)

        # Line total is based on SELLING price (per base unit)
        line_total = round(qty_base * sell_base * (1 - disc_pct / 100.0), 2)
        taxable = line_total / (1 + gst / 100.0) if gst else line_total
        tax_amt = round(line_total - taxable, 2)

        sub_total += line_total
        tax_total += tax_amt

        effective_cost = round(cost_base * qty_base / total_units, 6) if total_units else cost_base

        batch_no = (it.get("batch_no") or "NA").strip() or "NA"
        mfg = parse_date(it.get("mfg_date"))
        exp = parse_date(it.get("exp_date"))

        batch = Batch.query.filter_by(medicine_id=med.id, batch_no=batch_no).first()
        if not batch:
            batch = Batch(
                medicine_id=med.id, vendor_id=vendor.id, batch_no=batch_no,
                mfg_date=mfg, exp_date=exp,
                cost_price=effective_cost, mrp=mrp_base,
                selling_price=sell_base, gst_rate=gst,
                qty=0, initial_qty=0, free_qty=0,
                entry_qty=qty_in,
                entry_unit=unit if unit != "base" else "tablet",
            )
            db.session.add(batch)
            db.session.flush()
        else:
            batch.cost_price = effective_cost
            batch.mrp = mrp_base
            batch.selling_price = sell_base
            batch.gst_rate = gst
            batch.entry_qty = qty_in
            batch.entry_unit = unit if unit != "base" else "tablet"

        batch.qty = (batch.qty or 0) + total_units
        batch.initial_qty = (batch.initial_qty or 0) + total_units
        batch.free_qty = (batch.free_qty or 0) + free_base

        db.session.add(PurchaseItem(
            purchase_id=p.id, medicine_id=med.id, batch_id=batch.id,
            batch_no=batch.batch_no, mfg_date=batch.mfg_date, exp_date=batch.exp_date,
            quantity=qty_base, free_qty=free_base,
            cost_price=effective_cost, mrp=mrp_base, selling_price=sell_base,
            gst_rate=gst, discount_percent=disc_pct, line_total=line_total,
        ))

        med.cost_price = effective_cost
        if not med.selling_price:
            med.selling_price = sell_base
        if not med.mrp:
            med.mrp = mrp_base

    discount = _to_num(d.get("discount"), 0)
    total = round(sub_total - discount, 2)

    p.sub_total = round(sub_total, 2)
    p.tax_amount = round(tax_total, 2)
    p.total = total

    paid = 0.0
    for pay in (d.get("payments") or []):
        amt = _to_num(pay.get("amount"), 0)
        if amt <= 0:
            continue
        db.session.add(VendorPayment(
            vendor_id=vendor.id, purchase_id=p.id, amount=amt,
            mode=pay.get("mode", "cash"),
            reference=pay.get("reference"),
            user_id=int(get_jwt_identity()),
        ))
        paid += amt

    p.paid_amount = round(paid, 2)
    p.due_amount = round(max(total - paid, 0), 2)
    p.status = "paid" if p.due_amount <= 0.01 else ("partial" if paid > 0 else "unpaid")

    try:
        audit("create", "purchase_invoices", p.id, None,
              {"invoice_no": p.invoice_no, "total": total})
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"message": "Failed to save purchase", "error": str(e)}), 400

    return jsonify(p.to_dict()), 201


# ── Purchase Returns ──
@purchases_bp.get("/returns/all")
@role_required()
def list_returns():
    return jsonify([r.to_dict() for r in
                    PurchaseReturn.query.order_by(PurchaseReturn.id.desc()).limit(300).all()])


@purchases_bp.post("/returns")
@role_required("super_admin", "admin", "inventory_manager")
def create_purchase_return():
    d = request.get_json() or {}
    purchase = Purchase.query.get(d.get("purchase_id"))
    if not purchase:
        return jsonify({"message": "Invalid purchase"}), 400

    pr = PurchaseReturn(
        purchase_id=purchase.id, vendor_id=purchase.vendor_id,
        return_date=parse_date(d.get("return_date")) or datetime.utcnow().date(),
        reason=d.get("reason"),
        user_id=int(get_jwt_identity()),
    )
    db.session.add(pr)
    db.session.flush()

    total = 0.0
    for it in (d.get("items") or []):
        pi = PurchaseItem.query.get(it.get("purchase_item_id"))
        if not pi:
            continue
        qty = _to_int(it.get("quantity"), 0)
        if qty <= 0:
            continue
        qty = min(qty, (pi.quantity or 0) - (pi.returned_qty or 0))
        if qty <= 0:
            continue

        line_total = round(qty * (pi.cost_price or 0), 2)
        total += line_total

        batch = Batch.query.get(pi.batch_id)
        if batch:
            batch.qty = max(0, (batch.qty or 0) - qty)

        pi.returned_qty = (pi.returned_qty or 0) + qty
        db.session.add(PurchaseReturnItem(
            purchase_return_id=pr.id, medicine_id=pi.medicine_id,
            batch_id=pi.batch_id, quantity=qty,
            cost_price=pi.cost_price, line_total=line_total,
        ))

    pr.total = round(total, 2)
    audit("create", "purchase_returns", pr.id, None, {"total": total})
    db.session.commit()
    return jsonify(pr.to_dict()), 201