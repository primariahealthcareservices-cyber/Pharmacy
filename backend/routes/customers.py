from flask import Blueprint, jsonify, request
from sqlalchemy import or_

from extensions import db
from models import Customer, Sale
from utils.auth import role_required

# Register in app.py (replace the old customers blueprint if you have one):
#   from routes.customers import customers_bp
#   app.register_blueprint(customers_bp, url_prefix="/api/customers")
customers_bp = Blueprint("customers", __name__)

CUSTOMER_TYPES = {"walk_in", "online"}


def _clean_type(value, default="walk_in"):
    value = (value or "").strip().lower().replace("-", "_").replace(" ", "_")
    # Old rows were saved as "retail" -> treat as walk-in
    if value in ("", "retail"):
        return default
    return value if value in CUSTOMER_TYPES else None


def _apply_payload(c, data):
    for f in ("name", "phone", "email", "gender", "address", "doctor_name"):
        if f in data:
            v = data[f]
            setattr(c, f, v.strip() if isinstance(v, str) and v.strip() else None)
    if "age" in data:
        c.age = int(data["age"]) if str(data["age"]).strip() != "" else None
    if "credit_limit" in data:
        c.credit_limit = float(data["credit_limit"] or 0)


# ───────────── LIST  (?type=walk_in|online  &q=  &limit=) ─────────────
@customers_bp.get("")
@customers_bp.get("/")
@role_required()
def list_customers():
    q = (request.args.get("q") or "").strip()
    ctype = (request.args.get("type") or "").strip().lower()
    limit = request.args.get("limit", type=int)

    query = Customer.query.filter(Customer.is_active.is_(True))

    if ctype in CUSTOMER_TYPES:
        if ctype == "walk_in":
            # include legacy rows saved as "retail" / NULL
            query = query.filter(
                or_(Customer.customer_type == "walk_in",
                    Customer.customer_type == "retail",
                    Customer.customer_type.is_(None))
            )
        else:
            query = query.filter(Customer.customer_type == "online")

    if q:
        like = f"%{q}%"
        query = query.filter(or_(Customer.name.ilike(like),
                                 Customer.phone.ilike(like),
                                 Customer.email.ilike(like)))

    query = query.order_by(Customer.name.asc())
    if limit:
        query = query.limit(min(limit, 100))

    return jsonify([c.to_dict() for c in query.all()])


@customers_bp.get("/<int:cid>")
@role_required()
def get_customer(cid):
    return jsonify(Customer.query.get_or_404(cid).to_dict())


@customers_bp.post("")
@customers_bp.post("/")
@role_required()
def create_customer():
    data = request.get_json(silent=True) or {}
    if not (data.get("name") or "").strip():
        return jsonify({"message": "Name is required"}), 400

    ctype = _clean_type(data.get("customer_type"))
    if ctype is None:
        return jsonify({"message": "customer_type must be walk_in or online"}), 400

    # Online customers need a phone so the delivery team can reach them
    if ctype == "online" and not (data.get("phone") or "").strip():
        return jsonify({"message": "Phone is required for online customers"}), 400

    c = Customer(customer_type=ctype)
    _apply_payload(c, data)
    db.session.add(c)
    db.session.commit()
    return jsonify(c.to_dict()), 201


@customers_bp.put("/<int:cid>")
@role_required()
def update_customer(cid):
    c = Customer.query.get_or_404(cid)
    data = request.get_json(silent=True) or {}

    if "customer_type" in data:
        ctype = _clean_type(data["customer_type"])
        if ctype is None:
            return jsonify({"message": "customer_type must be walk_in or online"}), 400
        c.customer_type = ctype

    _apply_payload(c, data)
    if not c.name:
        return jsonify({"message": "Name is required"}), 400
    if c.customer_type == "online" and not c.phone:
        return jsonify({"message": "Phone is required for online customers"}), 400

    db.session.commit()
    return jsonify(c.to_dict())


@customers_bp.delete("/<int:cid>")
@role_required()
def delete_customer(cid):
    c = Customer.query.get_or_404(cid)
    # Keep history intact: customers with bills are only deactivated
    if Sale.query.filter_by(customer_id=cid).first():
        c.is_active = False
        db.session.commit()
        return jsonify({"message": "Customer has bills, so it was deactivated"})
    db.session.delete(c)
    db.session.commit()
    return jsonify({"message": "Deleted"})