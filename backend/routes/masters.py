from flask import Blueprint, request, jsonify
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError, DataError
from extensions import db
from models import (
    Manufacturer, Vendor, Customer, Category,
    ExpenseCategory, Purchase, VendorPayment, PurchaseReturn,
    Sale, CustomerPayment, SalesReturn,
)
from utils.auth import role_required
from utils.helpers import audit

masters_bp = Blueprint("masters", __name__)

WRITE_ROLES = ("super_admin", "admin", "inventory_manager", "accountant")


# ───────────────────────── COERCION HELPERS ─────────────────────────
def _to_int(v, default=0):
    if v in (None, ""):
        return default
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return default


def _to_float(v, default=0.0):
    if v in (None, ""):
        return default
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _to_bool(v, default=True):
    if v in (None, ""):
        return default
    if isinstance(v, bool):
        return v
    if isinstance(v, str):
        return v.strip().lower() in ("1", "true", "yes", "y", "on")
    return bool(v)


def _clean_str(v):
    if v is None:
        return None
    if isinstance(v, str):
        v = v.strip()
        return v if v != "" else None
    return v


def _coerce(data, schema):
    """
    schema = {
        "field": "str" | "int" | "float" | "bool",
        ...
    }
    Only fields present in `data` are returned.
    Empty strings become None (for text) or 0/0.0 (for numbers).
    """
    out = {}
    for f, kind in schema.items():
        if f not in data:
            continue
        v = data[f]
        if kind == "str":
            out[f] = _clean_str(v)
        elif kind == "int":
            out[f] = _to_int(v, 0)
        elif kind == "float":
            out[f] = _to_float(v, 0.0)
        elif kind == "bool":
            out[f] = _to_bool(v, True)
        else:
            out[f] = v
    return out


# ───────────────────────── GENERIC CRUD FACTORY ─────────────────────────
def make_crud(bp, path, model, schema, *, unique=None, search_fields=(), children=None):
    """
    schema         : {"field": "str"|"int"|"float"|"bool"}
    unique         : list of field names that must be unique (e.g. ["name"])
    search_fields  : columns used for ?q= search
    children       : optional callable(obj) -> list of related objects that
                     block deletion when non-empty; used for nice 409s.
    """

    # ── LIST ──
    @role_required()
    def list_items():
        q = (request.args.get("q") or "").strip()
        query = model.query
        if q and search_fields:
            query = query.filter(or_(*[
                getattr(model, f).like(f"%{q}%") for f in search_fields
            ]))
        if hasattr(model, "is_active") and request.args.get("active_only") == "1":
            query = query.filter(model.is_active.is_(True))
        items = query.order_by(db.desc(model.id)).all()
        return jsonify([i.to_dict() for i in items])

    # ── CREATE ──
    @role_required(*WRITE_ROLES)
    def create_item():
        raw = request.get_json(silent=True) or {}
        clean = _coerce(raw, schema)

        # required name (all our masters have one)
        if "name" in schema and not clean.get("name"):
            return jsonify({"message": "name is required"}), 400

        # unique check (friendly 409 instead of IntegrityError 500)
        if unique:
            for f in unique:
                if clean.get(f) is not None:
                    dup = model.query.filter(getattr(model, f) == clean[f]).first()
                    if dup:
                        return jsonify({
                            "message": f"A record with this {f.replace('_', ' ')} already exists"
                        }), 409

        obj = model()
        for f, v in clean.items():
            setattr(obj, f, v)

        try:
            db.session.add(obj)
            db.session.flush()
            audit("create", model.__tablename__, obj.id, None, clean)
            db.session.commit()
        except (IntegrityError, DataError) as e:
            db.session.rollback()
            return jsonify({
                "message": f"Failed to create {model.__tablename__[:-1]}",
                "error": str(e.orig) if hasattr(e, "orig") else str(e),
            }), 400
        except Exception as e:
            db.session.rollback()
            return jsonify({
                "message": f"Failed to create {model.__tablename__[:-1]}",
                "error": str(e),
            }), 400

        return jsonify(obj.to_dict()), 201

    # ── GET ONE ──
    @role_required()
    def get_item(oid):
        return jsonify(model.query.get_or_404(oid).to_dict())

    # ── UPDATE ──
    @role_required(*WRITE_ROLES)
    def update_item(oid):
        obj = model.query.get_or_404(oid)
        old = obj.to_dict()
        raw = request.get_json(silent=True) or {}
        clean = _coerce(raw, schema)

        if unique:
            for f in unique:
                if f in clean and clean[f] is not None and clean[f] != getattr(obj, f):
                    dup = model.query.filter(
                        getattr(model, f) == clean[f], model.id != oid
                    ).first()
                    if dup:
                        return jsonify({
                            "message": f"A record with this {f.replace('_', ' ')} already exists"
                        }), 409

        for f, v in clean.items():
            setattr(obj, f, v)

        try:
            audit("update", model.__tablename__, oid, old, clean)
            db.session.commit()
        except (IntegrityError, DataError) as e:
            db.session.rollback()
            return jsonify({
                "message": f"Failed to update {model.__tablename__[:-1]}",
                "error": str(e.orig) if hasattr(e, "orig") else str(e),
            }), 400
        except Exception as e:
            db.session.rollback()
            return jsonify({
                "message": f"Failed to update {model.__tablename__[:-1]}",
                "error": str(e),
            }), 400

        return jsonify(obj.to_dict())

    # ── DELETE ──
    @role_required("super_admin", "admin")
    def delete_item(oid):
        obj = model.query.get_or_404(oid)

        # children guard (nice 409 instead of FK violation)
        if children:
            blockers = children(obj)
            if blockers:
                return jsonify({
                    "message": (
                        f"Cannot delete '{getattr(obj, 'name', oid)}' — "
                        f"{len(blockers)} related record(s) still reference it. "
                        f"Reassign or delete those first."
                    )
                }), 409

        try:
            audit("delete", model.__tablename__, oid, obj.to_dict())
            db.session.delete(obj)
            db.session.commit()
        except IntegrityError as e:
            db.session.rollback()
            return jsonify({
                "message": f"Cannot delete — referenced by other records",
                "error": str(e.orig) if hasattr(e, "orig") else str(e),
            }), 409

        return jsonify({"message": "deleted"})

    bp.add_url_rule(f"/{path}", endpoint=f"{path}_list",
                    view_func=list_items, methods=["GET"])
    bp.add_url_rule(f"/{path}", endpoint=f"{path}_create",
                    view_func=create_item, methods=["POST"])
    bp.add_url_rule(f"/{path}/<int:oid>", endpoint=f"{path}_get",
                    view_func=get_item, methods=["GET"])
    bp.add_url_rule(f"/{path}/<int:oid>", endpoint=f"{path}_update",
                    view_func=update_item, methods=["PUT"])
    bp.add_url_rule(f"/{path}/<int:oid>", endpoint=f"{path}_delete",
                    view_func=delete_item, methods=["DELETE"])


# ──────────── SCHEMAS — one per model ────────────
MANUFACTURER_SCHEMA = {
    "name": "str",
    "code": "str",
    "contact_person": "str",
    "phone": "str",
    "email": "str",
    "address": "str",
    "gst_number": "str",
    "drug_license": "str",
    "payment_terms": "str",
    "credit_limit": "float",
    "opening_balance": "float",
    "bank_details": "str",
}

VENDOR_SCHEMA = {
    "name": "str",
    "contact_person": "str",
    "phone": "str",
    "email": "str",
    "address": "str",
    "gst_number": "str",
    "license_number": "str",
    "payment_terms": "str",
    "credit_days": "int",
    "opening_balance": "float",
    "credit_limit": "float",
    "is_active": "bool",
}

CUSTOMER_SCHEMA = {
    "name": "str",
    "phone": "str",
    "email": "str",
    "age": "int",
    "gender": "str",
    "address": "str",
    "customer_type": "str",
    "doctor_name": "str",
    "credit_limit": "float",
    "is_active": "bool",
}

CATEGORY_SCHEMA = {
    "name": "str",
    "description": "str",
}

EXPENSE_CATEGORY_SCHEMA = {
    "name": "str",
    "description": "str",
}


# ──────────── REGISTER ALL SIMPLE MASTERS ────────────
make_crud(
    masters_bp, "manufacturers", Manufacturer,
    MANUFACTURER_SCHEMA,
    unique=["name"],
    search_fields=("name", "code", "phone", "gst_number"),
    children=lambda m: m.medicines,
)

make_crud(
    masters_bp, "vendors", Vendor,
    VENDOR_SCHEMA,
    unique=["name"],
    search_fields=("name", "phone", "gst_number"),
    children=lambda v: (
        Purchase.query.filter_by(vendor_id=v.id).limit(1).all()
        + VendorPayment.query.filter_by(vendor_id=v.id).limit(1).all()
    ),
)

make_crud(
    masters_bp, "customers", Customer,
    CUSTOMER_SCHEMA,
    unique=None,
    search_fields=("name", "phone", "email"),
    children=lambda c: (
        Sale.query.filter_by(customer_id=c.id).limit(1).all()
        + CustomerPayment.query.filter_by(customer_id=c.id).limit(1).all()
    ),
)

make_crud(
    masters_bp, "categories", Category,
    CATEGORY_SCHEMA,
    unique=["name"],
    search_fields=("name",),
)

make_crud(
    masters_bp, "expense-categories", ExpenseCategory,
    EXPENSE_CATEGORY_SCHEMA,
    unique=["name"],
    search_fields=("name",),
)


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
        "summary": {
            "opening": v.opening_balance or 0,
            "purchases": round(total_purchase, 2),
            "payments": round(total_paid, 2),
            "returns": round(total_return, 2),
            "balance": round(balance, 2),
        },
        "purchases": [{
            "id": p.id, "invoice_no": p.invoice_no,
            "date": p.invoice_date.isoformat() if p.invoice_date else None,
            "total": p.total, "paid": p.paid_amount, "due": p.due_amount,
        } for p in purchases],
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
        "summary": {
            "sales": round(total_sales, 2),
            "payments": round(total_paid, 2),
            "returns": round(total_return, 2),
            "balance": round(balance, 2),
            "credit_limit": c.credit_limit or 0,
            "available_credit": round((c.credit_limit or 0) - balance, 2),
        },
        "sales": [{
            "id": s.id, "invoice_no": s.invoice_no,
            "date": s.sale_date.isoformat() if s.sale_date else None,
            "total": s.total, "paid": s.paid_amount, "due": s.due_amount,
        } for s in sales],
        "payments": [p.to_dict() for p in payments],
    })