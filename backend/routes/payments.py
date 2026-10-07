from flask import Blueprint, request, jsonify
from datetime import datetime
from sqlalchemy import func
from extensions import db
from models import (
    CustomerPayment, VendorPayment, ManufacturerPayment,
    Customer, Vendor, Manufacturer,
    Medicine, Batch,
    Sale, Purchase, SalesReturn, PurchaseReturn,
)
from utils.auth import role_required
from utils.helpers import audit
from flask_jwt_extended import get_jwt_identity

payments_bp = Blueprint("payments", __name__)


# ──────────────────── Customer payments ────────────────────
@payments_bp.get("/customer")
@role_required()
def list_customer_payments():
    q = CustomerPayment.query
    if request.args.get("customer_id"):
        q = q.filter(CustomerPayment.customer_id == int(request.args["customer_id"]))
    return jsonify([p.to_dict() for p in q.order_by(CustomerPayment.id.desc()).limit(500).all()])


@payments_bp.post("/customer")
@role_required("super_admin", "admin", "accountant", "cashier", "manager")
def create_customer_payment():
    d = request.get_json() or {}
    customer = Customer.query.get(d.get("customer_id"))
    if not customer:
        return jsonify({"message": "Invalid customer"}), 400
    amt = float(d.get("amount") or 0)
    if amt <= 0:
        return jsonify({"message": "Invalid amount"}), 400

    payment = CustomerPayment(
        customer_id=customer.id,
        sale_id=d.get("sale_id"),
        amount=amt,
        mode=d.get("mode", "cash"),
        payment_date=datetime.utcnow(),
        reference=d.get("reference"),
        notes=d.get("notes"),
        user_id=int(get_jwt_identity()),
    )
    db.session.add(payment)

    if d.get("sale_id"):
        sale = Sale.query.get(d["sale_id"])
        if sale:
            sale.paid_amount = round((sale.paid_amount or 0) + amt, 2)
            sale.due_amount = round(sale.total - sale.paid_amount, 2)
            sale.payment_status = "paid" if sale.due_amount <= 0.01 else "partial"
    else:
        remaining = amt
        unpaid = (Sale.query.filter_by(customer_id=customer.id)
                  .filter(Sale.due_amount > 0).order_by(Sale.sale_date.asc()).all())
        for s in unpaid:
            if remaining <= 0:
                break
            apply = min(remaining, s.due_amount)
            s.paid_amount = round((s.paid_amount or 0) + apply, 2)
            s.due_amount = round(s.total - s.paid_amount, 2)
            s.payment_status = "paid" if s.due_amount <= 0.01 else "partial"
            remaining -= apply

    audit("payment", "customer_payments", None, None, {"amount": amt, "customer": customer.name})
    db.session.commit()
    return jsonify(payment.to_dict()), 201


# ──────────────────── Vendor payments ────────────────────
@payments_bp.get("/vendor")
@role_required()
def list_vendor_payments():
    q = VendorPayment.query
    if request.args.get("vendor_id"):
        q = q.filter(VendorPayment.vendor_id == int(request.args["vendor_id"]))
    return jsonify([p.to_dict() for p in q.order_by(VendorPayment.id.desc()).limit(500).all()])


@payments_bp.post("/vendor")
@role_required("super_admin", "admin", "accountant", "manager")
def create_vendor_payment():
    d = request.get_json() or {}
    vendor = Vendor.query.get(d.get("vendor_id"))
    if not vendor:
        return jsonify({"message": "Invalid vendor"}), 400
    amt = float(d.get("amount") or 0)
    if amt <= 0:
        return jsonify({"message": "Invalid amount"}), 400

    payment = VendorPayment(
        vendor_id=vendor.id, purchase_id=d.get("purchase_id"),
        amount=amt, mode=d.get("mode", "cash"),
        payment_date=datetime.utcnow(),
        reference=d.get("reference"), notes=d.get("notes"),
        user_id=int(get_jwt_identity()),
    )
    db.session.add(payment)

    if d.get("purchase_id"):
        p = Purchase.query.get(d["purchase_id"])
        if p:
            p.paid_amount = round((p.paid_amount or 0) + amt, 2)
            p.due_amount = round(p.total - p.paid_amount, 2)
            p.status = "paid" if p.due_amount <= 0.01 else "partial"
    else:
        remaining = amt
        unpaid = (Purchase.query.filter_by(vendor_id=vendor.id)
                  .filter(Purchase.due_amount > 0).order_by(Purchase.invoice_date.asc()).all())
        for p in unpaid:
            if remaining <= 0:
                break
            apply = min(remaining, p.due_amount)
            p.paid_amount = round((p.paid_amount or 0) + apply, 2)
            p.due_amount = round(p.total - p.paid_amount, 2)
            p.status = "paid" if p.due_amount <= 0.01 else "partial"
            remaining -= apply

    audit("payment", "vendor_payments", None, None, {"amount": amt, "vendor": vendor.name})
    db.session.commit()
    return jsonify(payment.to_dict()), 201


# ──────────────────── Manufacturer payments ────────────────────
@payments_bp.get("/manufacturer")
@role_required()
def list_manufacturer_payments():
    q = ManufacturerPayment.query
    if request.args.get("manufacturer_id"):
        q = q.filter(ManufacturerPayment.manufacturer_id == int(request.args["manufacturer_id"]))
    return jsonify([p.to_dict() for p in q.order_by(ManufacturerPayment.id.desc()).limit(500).all()])


@payments_bp.post("/manufacturer")
@role_required("super_admin", "admin", "accountant", "manager")
def create_manufacturer_payment():
    d = request.get_json() or {}
    mfr = Manufacturer.query.get(d.get("manufacturer_id"))
    if not mfr:
        return jsonify({"message": "Invalid manufacturer"}), 400
    amt = float(d.get("amount") or 0)
    if amt <= 0:
        return jsonify({"message": "Invalid amount"}), 400

    payment = ManufacturerPayment(
        manufacturer_id=mfr.id,
        amount=amt,
        mode=d.get("mode", "cash"),
        payment_date=datetime.utcnow(),
        reference=d.get("reference"),
        notes=d.get("notes"),
        user_id=int(get_jwt_identity()),
    )
    db.session.add(payment)

    audit("payment", "manufacturer_payments", None, None,
          {"amount": amt, "manufacturer": mfr.name})
    db.session.commit()
    return jsonify(payment.to_dict()), 201


# ─────────── HELPERS for manufacturer totals ───────────
def _manufacturer_total(mid):
    """
    Sum of (initial_qty × cost_price) across every batch belonging to
    that manufacturer's medicines.
    """
    total = (
        db.session.query(
            func.coalesce(func.sum(Batch.initial_qty * Batch.cost_price), 0)
        )
        .join(Medicine, Batch.medicine_id == Medicine.id)
        .filter(Medicine.manufacturer_id == mid)
        .scalar()
    )
    return float(total or 0)


def _manufacturer_paid(mid):
    paid = (
        db.session.query(func.coalesce(func.sum(ManufacturerPayment.amount), 0))
        .filter(ManufacturerPayment.manufacturer_id == mid)
        .scalar()
    )
    return float(paid or 0)


# ──────────────────── Outstanding lists ────────────────────
@payments_bp.get("/outstanding/customers")
@role_required()
def outstanding_customers():
    rows = (db.session.query(Sale.customer_id).filter(Sale.due_amount > 0)
            .distinct().all())
    out = []
    for (cid,) in rows:
        c = Customer.query.get(cid)
        if not c:
            continue
        sales = Sale.query.filter_by(customer_id=cid).all()
        due = sum(s.due_amount or 0 for s in sales)
        ret = sum(r.total or 0 for r in SalesReturn.query.filter_by(customer_id=cid).all())
        outstanding = round(due - ret, 2)
        if outstanding <= 0.01:
            continue
        out.append({"customer_id": cid, "name": c.name, "phone": c.phone,
                    "outstanding": outstanding,
                    "credit_limit": c.credit_limit or 0})
    return jsonify(sorted(out, key=lambda x: -x["outstanding"]))


@payments_bp.get("/outstanding/vendors")
@role_required()
def outstanding_vendors():
    out = []
    for v in Vendor.query.all():
        purchases = Purchase.query.filter_by(vendor_id=v.id).all()
        paid = sum(p.amount or 0 for p in VendorPayment.query.filter_by(vendor_id=v.id).all())
        ret = sum(r.total or 0 for r in PurchaseReturn.query.filter_by(vendor_id=v.id).all())
        total = sum(p.total or 0 for p in purchases)
        due = (v.opening_balance or 0) + total - paid - ret
        if due > 0.01:
            out.append({"vendor_id": v.id, "name": v.name, "phone": v.phone,
                        "outstanding": round(due, 2)})
    return jsonify(sorted(out, key=lambda x: -x["outstanding"]))


@payments_bp.get("/outstanding/manufacturers")
@role_required()
def outstanding_manufacturers():
    """
    Total  = sum of (batch.initial_qty × batch.cost_price) for all their medicines
    Paid   = sum of ManufacturerPayment rows for that manufacturer
    Balance = Total − Paid
    """
    out = []
    for m in Manufacturer.query.all():
        total = _manufacturer_total(m.id)
        paid = _manufacturer_paid(m.id)
        balance = round(total - paid, 2)

        # skip manufacturers with no medicines and no history
        if total == 0 and paid == 0:
            continue

        status = "paid" if balance <= 0.01 else ("partial" if paid > 0 else "unpaid")

        out.append({
            "manufacturer_id": m.id,
            "name": m.name,
            "phone": m.phone,
            "total_amount": round(total, 2),
            "paid_amount": round(paid, 2),
            "outstanding": max(balance, 0),
            "status": status,
            "medicine_count": len(m.medicines),
        })
    return jsonify(sorted(out, key=lambda x: -x["outstanding"]))


# ─────────── Manufacturer detail (medicines + payments) ───────────
@payments_bp.get("/manufacturers/<int:mid>/summary")
@role_required()
def manufacturer_summary(mid):
    m = Manufacturer.query.get_or_404(mid)

    medicines = []
    total = 0.0
    for med in m.medicines:
        med_total = sum(
            (b.initial_qty or 0) * (b.cost_price or 0)
            for b in med.batches
        )
        total += med_total
        medicines.append({
            "id": med.id,
            "name": med.name,
            "sku": med.sku,
            "stock": med.stock(),
            "cost_price": med.cost_price or 0,
            "selling_price": med.selling_price or 0,   # 🆕
            "total_cost": round(med_total, 2),
        })

    payments = (ManufacturerPayment.query
                .filter_by(manufacturer_id=mid)
                .order_by(ManufacturerPayment.id.desc()).all())
    paid = sum(p.amount or 0 for p in payments)

    return jsonify({
        "manufacturer": m.to_dict(),
        "medicines": medicines,
        "payments": [p.to_dict() for p in payments],
        "total_amount": round(total, 2),
        "paid_amount": round(paid, 2),
        "balance": round(max(total - paid, 0), 2),
    })