from flask import Blueprint, request, jsonify
from datetime import datetime
from sqlalchemy import or_
from extensions import db
from models import (Sale, SaleItem, SalePayment, SalesReturn, SalesReturnItem,
                    Batch, Medicine, Customer, CustomerPayment)
from utils.auth import role_required
from utils.helpers import audit, parse_date, to_base_qty
from flask_jwt_extended import get_jwt_identity

sales_bp = Blueprint("sales", __name__)

# Customer-type default discount %
CUSTOMER_DISCOUNT = {
    "retail": 0.0,
    "wholesale": 5.0,
    "hospital": 8.0,
    "corporate": 6.0,
    "vip": 10.0,
    "distributor": 12.0,
}


def next_invoice_no():
    last = Sale.query.order_by(Sale.id.desc()).first()
    n = (last.id if last else 0) + 1
    return f"INV-{datetime.utcnow().strftime('%Y%m')}-{n:05d}"


# ───────── LIST ─────────
@sales_bp.get("")
@role_required()
def list_sales():
    q = (request.args.get("q") or "").strip()
    query = Sale.query.outerjoin(Customer, Sale.customer_id == Customer.id)

    if q:
        like = f"%{q}%"
        query = query.filter(or_(
            Sale.invoice_no.like(like),
            Customer.name.like(like),
            Customer.phone.like(like),
            Sale.doctor_name.like(like),
        ))

    if request.args.get("customer_id"):
        query = query.filter(Sale.customer_id == int(request.args["customer_id"]))
    if request.args.get("from"):
        query = query.filter(Sale.sale_date >= datetime.combine(
            parse_date(request.args["from"]), datetime.min.time()))
    if request.args.get("to"):
        query = query.filter(Sale.sale_date <= datetime.combine(
            parse_date(request.args["to"]), datetime.max.time()))
    if request.args.get("status"):
        query = query.filter(Sale.payment_status == request.args["status"])

    return jsonify([s.to_dict() for s in
                    query.order_by(Sale.id.desc()).limit(500).all()])


# ───────── GET ONE ─────────
@sales_bp.get("/<int:sid>")
@role_required()
def get_sale(sid):
    return jsonify(Sale.query.get_or_404(sid).to_dict())


# ───────── CREATE ─────────
@sales_bp.post("")
@role_required("super_admin", "admin", "pharmacist", "cashier", "manager")
def create_sale():
    d = request.get_json() or {}
    items = d.get("items") or []
    if not items:
        return jsonify({"message": "Cart is empty"}), 400

    customer = Customer.query.get(d["customer_id"]) if d.get("customer_id") else None
    auto_disc = CUSTOMER_DISCOUNT.get((customer.customer_type if customer else "retail"), 0.0)

    sale = Sale(
        invoice_no=next_invoice_no(),
        customer_id=customer.id if customer else None,
        discount=float(d.get("discount") or 0),
        payment_mode=d.get("payment_mode", "cash"),
        prescription_no=d.get("prescription_no"),
        doctor_name=d.get("doctor_name") or (customer.doctor_name if customer else None),
        notes=d.get("notes"),
        user_id=int(get_jwt_identity()),
    )
    db.session.add(sale)
    db.session.flush()

    sub_total = 0.0
    tax_total = 0.0
    cogs_total = 0.0
    profit_total = 0.0

    for it in items:
        med = Medicine.query.get(it.get("medicine_id"))
        if not med:
            continue
        qty_base = to_base_qty(med, it.get("quantity", 0), it.get("unit", "strip"))
        if qty_base <= 0:
            continue

        batch = Batch.query.get(it["batch_id"]) if it.get("batch_id") else None
        if not batch or batch.qty < qty_base:
            batch = (Batch.query.filter(Batch.medicine_id == med.id, Batch.qty >= qty_base)
                     .order_by(Batch.exp_date.asc()).first())
        if not batch or batch.qty < qty_base:
            db.session.rollback()
            return jsonify({"message": f"Insufficient stock for {med.name}"}), 400

        unit_price = float(it.get("selling_price") or batch.selling_price or med.selling_price)
        line_disc = float(it.get("discount_percent") or 0) + auto_disc
        line_disc = min(line_disc, 100)

        gross = qty_base * unit_price
        line_total = round(gross * (1 - line_disc / 100), 2)

        gst = float(batch.gst_rate or med.gst_rate or 12)
        taxable = line_total / (1 + gst / 100)
        tax_amt = round(line_total - taxable, 2)

        cogs = round(qty_base * (batch.cost_price or 0), 2)
        profit = round(taxable - cogs, 2)

        batch.qty -= qty_base

        db.session.add(SaleItem(
            sale_id=sale.id, medicine_id=med.id, batch_id=batch.id,
            batch_no=batch.batch_no, exp_date=batch.exp_date,
            quantity=qty_base, unit_label=it.get("unit", "base"),
            mrp=batch.mrp or med.mrp, selling_price=unit_price,
            cost_price=batch.cost_price or 0,
            discount_percent=line_disc, gst_rate=gst,
            tax_amount=tax_amt, line_total=line_total, profit=profit,
        ))

        sub_total += line_total
        tax_total += tax_amt
        cogs_total += cogs
        profit_total += profit

    total = round(sub_total - sale.discount, 2)

    paid = 0.0
    for pay in (d.get("payments") or []):
        amt = float(pay.get("amount") or 0)
        if amt <= 0:
            continue
        db.session.add(SalePayment(sale_id=sale.id, mode=pay.get("mode", "cash"),
                                   amount=amt, reference=pay.get("reference")))
        paid += amt

    # Credit-limit check
    if customer and total - paid > 0:
        outstanding = sum(s.due_amount or 0 for s in
                          Sale.query.filter_by(customer_id=customer.id).all())
        if customer.credit_limit and (outstanding + (total - paid)) > customer.credit_limit:
            db.session.rollback()
            return jsonify({"message": "Credit limit exceeded for this customer"}), 400

    sale.sub_total = round(sub_total, 2)
    sale.tax_amount = round(tax_total, 2)
    sale.total = total
    sale.cogs = round(cogs_total, 2)
    sale.profit = round(profit_total, 2)
    sale.paid_amount = round(paid, 2)
    sale.due_amount = round(total - paid, 2)
    sale.payment_status = "paid" if sale.due_amount <= 0.01 else ("partial" if paid > 0 else "unpaid")

    audit("create", "sales", sale.id, None, {"invoice_no": sale.invoice_no, "total": total})
    db.session.commit()
    return jsonify(sale.to_dict()), 201


# ───────── ADD PAYMENT TO EXISTING SALE ─────────
@sales_bp.post("/<int:sid>/payments")
@role_required("super_admin", "admin", "cashier", "accountant", "manager")
def add_payment(sid):
    sale = Sale.query.get_or_404(sid)
    d = request.get_json() or {}
    amt = float(d.get("amount") or 0)
    if amt <= 0:
        return jsonify({"message": "Invalid amount"}), 400
    amt = min(amt, sale.due_amount)
    db.session.add(SalePayment(sale_id=sale.id, mode=d.get("mode", "cash"),
                               amount=amt, reference=d.get("reference")))
    sale.paid_amount = round((sale.paid_amount or 0) + amt, 2)
    sale.due_amount = round(sale.total - sale.paid_amount, 2)
    sale.payment_status = "paid" if sale.due_amount <= 0.01 else "partial"
    audit("payment", "sales", sale.id, None, {"amount": amt})
    db.session.commit()
    return jsonify(sale.to_dict())


# ───────── SALES RETURNS ─────────
@sales_bp.get("/returns/all")
@role_required()
def list_sales_returns():
    return jsonify([r.to_dict() for r in
                    SalesReturn.query.order_by(SalesReturn.id.desc()).limit(300).all()])


@sales_bp.post("/returns")
@role_required("super_admin", "admin", "pharmacist", "cashier", "manager")
def create_sales_return():
    d = request.get_json() or {}
    sale = Sale.query.get(d.get("sale_id"))
    if not sale:
        return jsonify({"message": "Invalid sale"}), 400

    sr = SalesReturn(sale_id=sale.id, customer_id=sale.customer_id,
                     reason=d.get("reason"),
                     refund_mode=d.get("refund_mode", "cash"),
                     user_id=int(get_jwt_identity()))
    db.session.add(sr)
    db.session.flush()

    total = 0.0
    for it in (d.get("items") or []):
        si = SaleItem.query.get(it.get("sale_item_id"))
        if not si:
            continue
        qty = int(it.get("quantity") or 0)
        qty = min(qty, si.quantity - si.returned_qty)
        if qty <= 0:
            continue
        line_total = round(qty * (si.selling_price or 0), 2)
        total += line_total

        batch = Batch.query.get(si.batch_id)
        if batch:
            batch.qty += qty

        si.returned_qty += qty
        db.session.add(SalesReturnItem(
            sales_return_id=sr.id, medicine_id=si.medicine_id,
            batch_id=si.batch_id, quantity=qty,
            selling_price=si.selling_price, line_total=line_total))

    sr.total = round(total, 2)
    sale.is_returned = True
    audit("create", "sales_returns", sr.id, None, {"total": total})
    db.session.commit()
    return jsonify(sr.to_dict()), 201