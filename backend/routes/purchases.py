from flask import Blueprint, request, jsonify
from datetime import datetime
from extensions import db
from models import (Purchase, PurchaseItem, PurchaseReturn, PurchaseReturnItem,
                    Batch, Medicine, Vendor, VendorPayment)
from utils.auth import role_required
from utils.helpers import (audit, parse_date, to_base_qty, to_base_price, money)
from flask_jwt_extended import get_jwt_identity

purchases_bp = Blueprint("purchases", __name__)


@purchases_bp.get("")
@role_required()
def list_purchases():
    q = Purchase.query
    if request.args.get("vendor_id"):
        q = q.filter(Purchase.vendor_id == int(request.args["vendor_id"]))
    if request.args.get("from"):
        q = q.filter(Purchase.invoice_date >= parse_date(request.args["from"]))
    if request.args.get("to"):
        q = q.filter(Purchase.invoice_date <= parse_date(request.args["to"]))
    if request.args.get("status"):
        q = q.filter(Purchase.status == request.args["status"])
    return jsonify([p.to_dict() for p in q.order_by(Purchase.id.desc()).limit(500).all()])


@purchases_bp.get("/<int:pid>")
@role_required()
def get_purchase(pid):
    return jsonify(Purchase.query.get_or_404(pid).to_dict())


@purchases_bp.post("")
@role_required("super_admin", "admin", "inventory_manager")
def create_purchase():
    d = request.get_json() or {}
    vendor = Vendor.query.get(d.get("vendor_id"))
    if not vendor:
        return jsonify({"message": "Invalid vendor"}), 400
    items = d.get("items") or []
    if not items:
        return jsonify({"message": "At least one item is required"}), 400

    p = Purchase(
        invoice_no=d.get("invoice_no") or f"PI-{int(datetime.utcnow().timestamp())}",
        vendor_id=vendor.id,
        invoice_date=parse_date(d.get("invoice_date")) or datetime.utcnow().date(),
        received_date=parse_date(d.get("received_date")) or datetime.utcnow().date(),
        discount=float(d.get("discount") or 0),
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
        unit = it.get("unit", "box")
        qty_base = to_base_qty(med, it.get("quantity", 0), unit)
        free_base = to_base_qty(med, it.get("free_qty", 0), unit)
        if qty_base <= 0:
            continue

        cost_base = to_base_price(it.get("cost_price", 0), med, unit)
        mrp_base = to_base_price(it.get("mrp", 0), med, unit)
        sell_base = to_base_price(it.get("selling_price") or it.get("mrp", 0), med, unit)
        gst = float(it.get("gst_rate", med.gst_rate or 12))
        disc_pct = float(it.get("discount_percent") or 0)

        # Free goods reduce effective cost
        total_units = qty_base + free_base
        effective_cost = round(cost_base * qty_base / total_units, 6) if total_units else cost_base

        line_total = round(qty_base * cost_base * (1 - disc_pct / 100), 2)
        taxable = line_total / (1 + gst / 100)
        tax_amt = round(line_total - taxable, 2)

        sub_total += line_total
        tax_total += tax_amt

        # Find or create batch
        batch = Batch.query.filter_by(medicine_id=med.id,
                                      batch_no=it.get("batch_no") or "NA").first()
        if not batch:
            batch = Batch(medicine_id=med.id, vendor_id=vendor.id,
                          batch_no=it.get("batch_no") or "NA",
                          mfg_date=parse_date(it.get("mfg_date")),
                          exp_date=parse_date(it.get("exp_date")),
                          cost_price=effective_cost, mrp=mrp_base,
                          selling_price=sell_base, gst_rate=gst,
                          qty=0, initial_qty=0)
            db.session.add(batch)
            db.session.flush()
        else:
            batch.cost_price = effective_cost
            batch.mrp = mrp_base
            batch.selling_price = sell_base

        batch.qty += total_units
        batch.initial_qty += total_units
        batch.free_qty += free_base

        pi = PurchaseItem(
            purchase_id=p.id, medicine_id=med.id, batch_id=batch.id,
            batch_no=batch.batch_no, mfg_date=batch.mfg_date, exp_date=batch.exp_date,
            quantity=qty_base, free_qty=free_base,
            cost_price=effective_cost, mrp=mrp_base, selling_price=sell_base,
            gst_rate=gst, discount_percent=disc_pct, line_total=line_total,
        )
        db.session.add(pi)

        # Update medicine latest cost
        med.cost_price = effective_cost
        if not med.selling_price:
            med.selling_price = sell_base
        if not med.mrp:
            med.mrp = mrp_base

    total = round(sub_total - p.discount, 2)
    p.sub_total = round(sub_total, 2)
    p.tax_amount = round(tax_total, 2)
    p.total = total

    paid = 0.0
    for pay in (d.get("payments") or []):
        amt = float(pay.get("amount") or 0)
        if amt <= 0:
            continue
        db.session.add(VendorPayment(vendor_id=vendor.id, purchase_id=p.id,
                                     amount=amt, mode=pay.get("mode", "cash"),
                                     reference=pay.get("reference"),
                                     user_id=int(get_jwt_identity())))
        paid += amt

    p.paid_amount = round(paid, 2)
    p.due_amount = round(total - paid, 2)
    p.status = "paid" if p.due_amount <= 0.01 else ("partial" if paid > 0 else "unpaid")

    audit("create", "purchase_invoices", p.id, None, {"invoice_no": p.invoice_no, "total": total})
    db.session.commit()
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

    pr = PurchaseReturn(purchase_id=purchase.id, vendor_id=purchase.vendor_id,
                        return_date=parse_date(d.get("return_date")) or datetime.utcnow().date(),
                        reason=d.get("reason"), user_id=int(get_jwt_identity()))
    db.session.add(pr)
    db.session.flush()

    total = 0.0
    for it in (d.get("items") or []):
        pi = PurchaseItem.query.get(it.get("purchase_item_id"))
        if not pi:
            continue
        qty = int(it.get("quantity") or 0)
        if qty <= 0:
            continue
        qty = min(qty, pi.quantity - pi.returned_qty)
        if qty <= 0:
            continue
        line_total = round(qty * (pi.cost_price or 0), 2)
        total += line_total

        batch = Batch.query.get(pi.batch_id)
        if batch:
            batch.qty = max(0, batch.qty - qty)

        pi.returned_qty += qty
        db.session.add(PurchaseReturnItem(
            purchase_return_id=pr.id, medicine_id=pi.medicine_id,
            batch_id=pi.batch_id, quantity=qty,
            cost_price=pi.cost_price, line_total=line_total))

    pr.total = round(total, 2)
    audit("create", "purchase_returns", pr.id, None, {"total": total})
    db.session.commit()
    return jsonify(pr.to_dict()), 201