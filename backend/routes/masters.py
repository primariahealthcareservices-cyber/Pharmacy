from flask import Blueprint, request, jsonify
from sqlalchemy import or_
from extensions import db
from models import (Manufacturer, Vendor, Customer, Category,
                    ExpenseCategory, Purchase, VendorPayment, PurchaseReturn,
                    Sale, CustomerPayment, SalesReturn)
from utils.auth import role_required
from utils.helpers import audit

masters_bp = Blueprint("masters", __name__)

WRITE_ROLES = ("super_admin", "admin", "inventory_manager", "accountant")


def make_crud(bp, path, model, fields, search_fields=()):
    # ---- LIST ----
    @role_required()
    def list_items():
        q = (request.args.get("q") or "").strip()
        query = model.query
        if q and search_fields:
            query = query.filter(or_(*[getattr(model, f).like(f"%{q}%")
                                       for f in search_fields]))
        if hasattr(model, "is_active") and request.args.get("active_only") == "1":
            query = query.filter(model.is_active.is_(True))
        items = query.order_by(db.desc(model.id)).all()
        return jsonify([i.to_dict() for i in items])

    # ---- CREATE ----
    @role_required(*WRITE_ROLES)
    def create_item():
        d = request.get_json() or {}
        obj = model()
        for f in fields:
            if f in d:
                setattr(obj, f, d[f])
        db.session.add(obj)
        db.session.flush()
        audit("create", model.__tablename__, obj.id, None, d)
        db.session.commit()
        return jsonify(obj.to_dict()), 201

    # ---- GET ONE ----
    @role_required()
    def get_item(oid):
        return jsonify(model.query.get_or_404(oid).to_dict())

    # ---- UPDATE ----
    @role_required(*WRITE_ROLES)
    def update_item(oid):
        obj = model.query.get_or_404(oid)
        old = obj.to_dict()
        d = request.get_json() or {}
        for f in fields:
            if f in d:
                setattr(obj, f, d[f])
        audit("update", model.__tablename__, oid, old, d)
        db.session.commit()
        return jsonify(obj.to_dict())

    # ---- DELETE ----
    @role_required("super_admin", "admin")
    def delete_item(oid):
        obj = model.query.get_or_404(oid)
        audit("delete", model.__tablename__, oid, obj.to_dict())
        db.session.delete(obj)
        db.session.commit()
        return jsonify({"message": "deleted"})

    bp.add_url_rule(f"/{path}", endpoint=f"{path}_list", view_func=list_items, methods=["GET"])
    bp.add_url_rule(f"/{path}", endpoint=f"{path}_create", view_func=create_item, methods=["POST"])
    bp.add_url_rule(f"/{path}/<int:oid>", endpoint=f"{path}_get", view_func=get_item, methods=["GET"])
    bp.add_url_rule(f"/{path}/<int:oid>", endpoint=f"{path}_update", view_func=update_item, methods=["PUT"])
    bp.add_url_rule(f"/{path}/<int:oid>", endpoint=f"{path}_delete", view_func=delete_item, methods=["DELETE"])


# ── Register all simple masters ──
make_crud(masters_bp, "manufacturers", Manufacturer,
          ["name", "code", "contact_person", "phone", "email", "address",
           "gst_number", "drug_license", "payment_terms", "credit_limit", "bank_details"],
          ("name", "code", "phone", "gst_number"))

make_crud(masters_bp, "vendors", Vendor,
          ["name", "contact_person", "phone", "email", "address", "gst_number",
           "license_number", "payment_terms", "credit_days", "opening_balance",
           "credit_limit", "is_active"],
          ("name", "phone", "gst_number"))

make_crud(masters_bp, "customers", Customer,
          ["name", "phone", "email", "age", "gender", "address", "customer_type",
           "doctor_name", "credit_limit", "is_active"],
          ("name", "phone", "email"))

make_crud(masters_bp, "categories", Category, ["name", "description"], ("name",))
make_crud(masters_bp, "expense-categories", ExpenseCategory, ["name", "description"], ("name",))


# ── Vendor ledger ──
@masters_bp.get("/vendors/<int:vid>/ledger")
@role_required()
def vendor_ledger(vid):
    v = Vendor.query.get_or_404(vid)
    purchases = Purchase.query.filter_by(vendor_id=vid).order_by(Purchase.invoice_date).all()
    payments = VendorPayment.query.filter_by(vendor_id=vid).order_by(VendorPayment.payment_date).all()
    returns = PurchaseReturn.query.filter_by(vendor_id=vid).all()

    total_purchase = sum(p.total or 0 for p in purchases)
    total_paid = sum(p.amount or 0 for p in payments)
    total_return = sum(r.total or 0 for r in returns)
    balance = (v.opening_balance or 0) + total_purchase - total_paid - total_return

    return jsonify({
        "vendor": v.to_dict(),
        "summary": {"opening": v.opening_balance or 0,
                    "purchases": round(total_purchase, 2),
                    "payments": round(total_paid, 2),
                    "returns": round(total_return, 2),
                    "balance": round(balance, 2)},
        "purchases": [{"id": p.id, "invoice_no": p.invoice_no,
                       "date": p.invoice_date.isoformat() if p.invoice_date else None,
                       "total": p.total, "paid": p.paid_amount, "due": p.due_amount}
                      for p in purchases],
        "payments": [p.to_dict() for p in payments],
    })


# ── Customer ledger ──
@masters_bp.get("/customers/<int:cid>/ledger")
@role_required()
def customer_ledger(cid):
    c = Customer.query.get_or_404(cid)
    sales = Sale.query.filter_by(customer_id=cid).order_by(Sale.sale_date).all()
    payments = CustomerPayment.query.filter_by(customer_id=cid).order_by(CustomerPayment.payment_date).all()
    returns = SalesReturn.query.filter_by(customer_id=cid).all()

    total_sales = sum(s.total or 0 for s in sales)
    total_paid = sum(p.amount or 0 for p in payments)
    total_return = sum(r.total or 0 for r in returns)
    balance = total_sales - total_paid - total_return

    return jsonify({
        "customer": c.to_dict(),
        "summary": {"sales": round(total_sales, 2), "payments": round(total_paid, 2),
                    "returns": round(total_return, 2), "balance": round(balance, 2),
                    "credit_limit": c.credit_limit or 0,
                    "available_credit": round((c.credit_limit or 0) - balance, 2)},
        "sales": [{"id": s.id, "invoice_no": s.invoice_no,
                   "date": s.sale_date.isoformat() if s.sale_date else None,
                   "total": s.total, "paid": s.paid_amount, "due": s.due_amount}
                  for s in sales],
        "payments": [p.to_dict() for p in payments],
    })