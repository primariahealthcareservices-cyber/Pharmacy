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

# ───────── Payment mode normalization ─────────
# All recognized online/UPI methods
ONLINE_MODES = {
    "online", "card", "upi", "netbanking", "wallet", "bank",
    "cheque", "neft", "rtgs", "imps",
    # ✅ New specific UPI apps
    "phonepe", "gpay", "googlepay", "google_pay", "google pay",
    "paytm", "amazonpay", "amazon_pay", "bhim", "otherupi", "other_upi",
}


def normalize_payment_mode(mode):
    """
    Keeps the original method name if it's a recognized mode,
    otherwise normalizes to 'cash' or 'card'.

    Returns a short lowercase key like:
      cash, card, upi, netbanking,
      phonepe, gpay, paytm, otherupi
    """
    if not mode:
        return "cash"
    m = str(mode).strip().lower().replace(" ", "").replace("_", "")

    if m in ("cash", "cod"):
        return "cash"
    if m in ("card", "debit", "credit"):
        return "card"
    if m in ("phonepe", "phone_pay", "phone pay"):
        return "phonepe"
    if m in ("gpay", "googlepay"):
        return "gpay"
    if m in ("paytm",):
        return "paytm"
    if m in ("amazonpay",):
        return "amazonpay"
    if m in ("bhim",):
        return "bhim"
    if m in ("netbanking", "net_banking"):
        return "netbanking"
    if m in ("upi", "otherupi"):
        return "upi"

    # Fallback
    if m in {x.replace("_", "").replace(" ", "") for x in ONLINE_MODES}:
        return m
    return "cash"


def next_invoice_no():
    last = Sale.query.order_by(Sale.id.desc()).first()
    n = (last.id if last else 0) + 1
    return f"INV-{datetime.utcnow().strftime('%Y%m')}-{n:05d}"


# ═══════════════════════════════════════════════════════════
#  LIST SALES
# ═══════════════════════════════════════════════════════════
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

    if request.args.get("payment_mode"):
        pm = normalize_payment_mode(request.args["payment_mode"])
        query = query.filter(Sale.payment_mode == pm)

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


# ═══════════════════════════════════════════════════════════
#  VIEW ONE SALE
# ═══════════════════════════════════════════════════════════
@sales_bp.get("/<int:sid>")
@role_required()
def get_sale(sid):
    sale = Sale.query.get_or_404(sid)
    return jsonify(sale.to_dict())


# ═══════════════════════════════════════════════════════════
#  CREATE SALE
# ═══════════════════════════════════════════════════════════
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
        payment_mode=normalize_payment_mode(d.get("payment_mode")),
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
        db.session.add(SalePayment(
            sale_id=sale.id,
            mode=normalize_payment_mode(pay.get("mode")),
            amount=amt,
            reference=pay.get("reference"),
        ))
        paid += amt

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

    result = sale.to_dict()
    result["success"] = True
    result["message"] = "Sale completed successfully"
    return jsonify(result), 201


# ═══════════════════════════════════════════════════════════
#  UPDATE SALE
# ═══════════════════════════════════════════════════════════
@sales_bp.put("/<int:sid>")
@role_required("super_admin", "admin", "manager", "accountant")
def update_sale(sid):
    sale = Sale.query.get_or_404(sid)
    d = request.get_json() or {}

    old_value = {
        "payment_mode": sale.payment_mode,
        "payment_status": sale.payment_status,
        "discount": sale.discount,
        "paid_amount": sale.paid_amount,
        "total": sale.total,
        "due_amount": sale.due_amount,
        "doctor_name": sale.doctor_name,
        "prescription_no": sale.prescription_no,
        "notes": sale.notes,
    }

    if "payment_mode" in d:
        sale.payment_mode = normalize_payment_mode(d.get("payment_mode"))
    if "doctor_name" in d:
        sale.doctor_name = d.get("doctor_name") or None
    if "prescription_no" in d:
        sale.prescription_no = d.get("prescription_no") or None
    if "notes" in d:
        sale.notes = d.get("notes") or None

    if "discount" in d:
        try:
            sale.discount = max(0.0, float(d.get("discount") or 0))
        except (TypeError, ValueError):
            return jsonify({"message": "Invalid discount value"}), 400

    sale.total = round((sale.sub_total or 0) - (sale.discount or 0), 2)

    if "paid_amount" in d:
        try:
            paid = max(0.0, float(d.get("paid_amount") or 0))
        except (TypeError, ValueError):
            return jsonify({"message": "Invalid paid_amount value"}), 400
        paid = min(paid, sale.total)
        sale.paid_amount = round(paid, 2)

    sale.due_amount = round(max(0.0, sale.total - (sale.paid_amount or 0)), 2)
    if sale.due_amount <= 0.01:
        sale.payment_status = "paid"
    elif (sale.paid_amount or 0) > 0:
        sale.payment_status = "partial"
    else:
        sale.payment_status = "unpaid"

    new_value = {
        "payment_mode": sale.payment_mode,
        "payment_status": sale.payment_status,
        "discount": sale.discount,
        "paid_amount": sale.paid_amount,
        "total": sale.total,
        "due_amount": sale.due_amount,
        "doctor_name": sale.doctor_name,
        "prescription_no": sale.prescription_no,
        "notes": sale.notes,
    }

    audit("update", "sales", sale.id, old_value, new_value)
    db.session.commit()
    return jsonify(sale.to_dict())


# ═══════════════════════════════════════════════════════════
#  ADD PAYMENT TO EXISTING SALE
# ═══════════════════════════════════════════════════════════
@sales_bp.post("/<int:sid>/payments")
@role_required("super_admin", "admin", "cashier", "accountant", "manager")
def add_payment(sid):
    sale = Sale.query.get_or_404(sid)
    d = request.get_json() or {}
    amt = float(d.get("amount") or 0)
    if amt <= 0:
        return jsonify({"message": "Invalid amount"}), 400

    amt = min(amt, sale.due_amount or 0)
    if amt <= 0:
        return jsonify({"message": "Nothing due on this sale"}), 400

    mode = normalize_payment_mode(d.get("mode"))

    db.session.add(SalePayment(
        sale_id=sale.id,
        mode=mode,
        amount=amt,
        reference=d.get("reference"),
    ))

    if (sale.paid_amount or 0) == 0:
        sale.payment_mode = mode

    sale.paid_amount = round((sale.paid_amount or 0) + amt, 2)
    sale.due_amount = round(max(0.0, sale.total - sale.paid_amount), 2)
    sale.payment_status = "paid" if sale.due_amount <= 0.01 else "partial"

    audit("payment", "sales", sale.id, None, {"amount": amt, "mode": mode})
    db.session.commit()

    result = sale.to_dict()
    result["success"] = True
    result["message"] = "Payment recorded successfully"
    return jsonify(result)


# ═══════════════════════════════════════════════════════════
#  DELETE SALE
# ═══════════════════════════════════════════════════════════
@sales_bp.delete("/<int:sid>")
@role_required("super_admin", "admin", "manager")
def delete_sale(sid):
    sale = Sale.query.get_or_404(sid)

    returns = SalesReturn.query.filter_by(sale_id=sale.id).count()
    if returns > 0:
        return jsonify({
            "message": "Cannot delete this sale because it has Sales Returns attached. "
                       "Please reverse the returns first."
        }), 409

    payments = SalePayment.query.filter_by(sale_id=sale.id).all()
    if len(payments) > 1:
        return jsonify({
            "message": "Cannot delete this sale because it has multiple payments recorded. "
                       "Refund or cancel the payments first."
        }), 409

    try:
        for item in sale.items:
            batch = Batch.query.get(item.batch_id)
            if batch:
                batch.qty = (batch.qty or 0) + (item.quantity or 0)

        old_value = {
            "invoice_no": sale.invoice_no,
            "total": sale.total,
            "paid_amount": sale.paid_amount,
            "payment_mode": sale.payment_mode,
        }
        audit("delete", "sales", sale.id, old_value, None)

        db.session.delete(sale)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({
            "message": "Failed to delete sale",
            "error": str(e),
        }), 500

    return jsonify({"message": "Sale deleted and stock restored"}), 200


# ═══════════════════════════════════════════════════════════
#  SALES RETURNS
# ═══════════════════════════════════════════════════════════
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

    sr = SalesReturn(
        sale_id=sale.id,
        customer_id=sale.customer_id,
        reason=d.get("reason"),
        refund_mode=normalize_payment_mode(d.get("refund_mode")),
        user_id=int(get_jwt_identity()),
    )
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