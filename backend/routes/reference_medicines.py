from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from extensions import db
from models import ReferenceMedicine, User, AuditLog

reference_medicines_bp = Blueprint("reference_medicines", __name__)


def _log(user_id, action, entity_id, old_value=None, new_value=None):
    try:
        user = User.query.get(user_id) if user_id else None
        log = AuditLog(
            user_id=user_id,
            user_name=user.name if user else None,
            action=action,
            entity="ReferenceMedicine",
            entity_id=entity_id,
            old_value=old_value,
            new_value=new_value,
            ip=request.remote_addr,
        )
        db.session.add(log)
    except Exception:
        pass


@reference_medicines_bp.get("")
@jwt_required()
def list_reference_medicines():
    q = (request.args.get("q") or "").strip()
    query = ReferenceMedicine.query

    if q:
        like = f"%{q}%"
        query = query.filter(
            db.or_(
                ReferenceMedicine.company.ilike(like),
                ReferenceMedicine.product_name.ilike(like),
                ReferenceMedicine.pack.ilike(like),
                ReferenceMedicine.discount_offer.ilike(like),
            )
        )

    items = query.order_by(
        ReferenceMedicine.company.asc(),
        ReferenceMedicine.product_name.asc(),
    ).all()
    return jsonify([i.to_dict() for i in items]), 200


@reference_medicines_bp.get("/<int:rid>")
@jwt_required()
def get_reference_medicine(rid):
    item = ReferenceMedicine.query.get(rid)
    if not item:
        return jsonify({"message": "Reference medicine not found"}), 404
    return jsonify(item.to_dict()), 200


@reference_medicines_bp.post("")
@jwt_required()
def create_reference_medicine():
    data = request.get_json() or {}

    company = (data.get("company") or "").strip()
    product_name = (data.get("product_name") or "").strip()

    if not company or not product_name:
        return jsonify({"message": "Company and Product Name are required"}), 400

    existing = ReferenceMedicine.query.filter(
        db.func.lower(ReferenceMedicine.company) == company.lower(),
        db.func.lower(ReferenceMedicine.product_name) == product_name.lower(),
    ).first()
    if existing:
        return jsonify({
            "message": "This product already exists for this company",
            "id": existing.id,
        }), 409

    try:
        quantity = int(data.get("quantity") or 0)
    except (ValueError, TypeError):
        return jsonify({"message": "Quantity must be a number"}), 400

    item = ReferenceMedicine(
        company=company,
        product_name=product_name,
        pack=(data.get("pack") or "").strip() or None,
        quantity=quantity,
        discount_offer=(data.get("discount_offer") or "").strip() or None,
    )
    db.session.add(item)
    db.session.flush()

    _log(get_jwt_identity(), "CREATE", item.id, None, str(item.to_dict()))
    db.session.commit()
    return jsonify(item.to_dict()), 201


@reference_medicines_bp.put("/<int:rid>")
@jwt_required()
def update_reference_medicine(rid):
    item = ReferenceMedicine.query.get(rid)
    if not item:
        return jsonify({"message": "Reference medicine not found"}), 404

    data = request.get_json() or {}
    old_value = str(item.to_dict())

    if "company" in data:
        company = (data.get("company") or "").strip()
        if not company:
            return jsonify({"message": "Company is required"}), 400
        item.company = company

    if "product_name" in data:
        product_name = (data.get("product_name") or "").strip()
        if not product_name:
            return jsonify({"message": "Product Name is required"}), 400
        item.product_name = product_name

    if "pack" in data:
        item.pack = (data.get("pack") or "").strip() or None

    if "quantity" in data:
        try:
            item.quantity = int(data.get("quantity") or 0)
        except (ValueError, TypeError):
            return jsonify({"message": "Quantity must be a number"}), 400

    if "discount_offer" in data:
        item.discount_offer = (data.get("discount_offer") or "").strip() or None

    _log(get_jwt_identity(), "UPDATE", item.id, old_value, str(item.to_dict()))
    db.session.commit()
    return jsonify(item.to_dict()), 200


@reference_medicines_bp.delete("/<int:rid>")
@jwt_required()
def delete_reference_medicine(rid):
    item = ReferenceMedicine.query.get(rid)
    if not item:
        return jsonify({"message": "Reference medicine not found"}), 404

    old_value = str(item.to_dict())
    db.session.delete(item)
    _log(get_jwt_identity(), "DELETE", rid, old_value, None)
    db.session.commit()
    return jsonify({"message": "Deleted successfully"}), 200


# ─────────────────────────────────────────────────────────────
# NEW ROUTE: Bulk Import from Excel
# ─────────────────────────────────────────────────────────────
@reference_medicines_bp.post("/bulk")
@jwt_required()
def bulk_import_reference_medicines():
    data = request.get_json() or {}
    rows = data.get("rows", [])

    if not rows:
        return jsonify({"message": "No rows provided"}), 400

    inserted = 0
    skipped = 0
    user_id = get_jwt_identity()

    for row in rows:
        company = (row.get("company") or "").strip()
        product_name = (row.get("product_name") or "").strip()

        # Skip if required fields are missing
        if not company or not product_name:
            skipped += 1
            continue

        # Check for duplicates (case-insensitive)
        existing = ReferenceMedicine.query.filter(
            db.func.lower(ReferenceMedicine.company) == company.lower(),
            db.func.lower(ReferenceMedicine.product_name) == product_name.lower(),
        ).first()

        if existing:
            skipped += 1
            continue

        try:
            quantity = int(row.get("quantity") or 0)
        except (ValueError, TypeError):
            quantity = 0

        item = ReferenceMedicine(
            company=company,
            product_name=product_name,
            pack=(row.get("pack") or "").strip() or None,
            quantity=quantity,
            discount_offer=(row.get("discount_offer") or "").strip() or None,
        )
        db.session.add(item)
        db.session.flush()  # Get the ID for logging

        _log(user_id, "BULK_CREATE", item.id, None, str(item.to_dict()))
        inserted += 1

    db.session.commit()

    return jsonify({
        "message": "Import complete",
        "inserted": inserted,
        "skipped": skipped
    }), 200