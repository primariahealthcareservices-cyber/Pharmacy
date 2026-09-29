from flask import Blueprint, request, jsonify
from datetime import datetime
from extensions import db
from models import Expense, ExpenseCategory
from utils.auth import role_required
from utils.helpers import audit, parse_date
from flask_jwt_extended import get_jwt_identity

expenses_bp = Blueprint("expenses", __name__)


@expenses_bp.get("")
@role_required()
def list_expenses():
    q = Expense.query
    if request.args.get("category_id"):
        q = q.filter(Expense.category_id == int(request.args["category_id"]))
    if request.args.get("from"):
        q = q.filter(Expense.expense_date >= parse_date(request.args["from"]))
    if request.args.get("to"):
        q = q.filter(Expense.expense_date <= parse_date(request.args["to"]))
    return jsonify([e.to_dict() for e in q.order_by(Expense.expense_date.desc()).limit(500).all()])


@expenses_bp.post("")
@role_required("super_admin", "admin", "accountant", "manager")
def create_expense():
    d = request.get_json() or {}
    e = Expense(category_id=d.get("category_id"),
                amount=float(d.get("amount") or 0),
                expense_date=parse_date(d.get("expense_date")) or datetime.utcnow().date(),
                payment_mode=d.get("payment_mode", "cash"),
                vendor_id=d.get("vendor_id"),
                description=d.get("description"),
                reference=d.get("reference"),
                user_id=int(get_jwt_identity()))
    db.session.add(e)
    db.session.flush()
    audit("create", "expenses", e.id, None, d)
    db.session.commit()
    return jsonify(e.to_dict()), 201


@expenses_bp.put("/<int:eid>")
@role_required("super_admin", "admin", "accountant")
def update_expense(eid):
    e = Expense.query.get_or_404(eid)
    d = request.get_json() or {}
    old = e.to_dict()
    for f in ("category_id", "amount", "payment_mode", "vendor_id",
              "description", "reference"):
        if f in d:
            setattr(e, f, d[f])
    if d.get("expense_date"):
        e.expense_date = parse_date(d["expense_date"])
    audit("update", "expenses", eid, old, d)
    db.session.commit()
    return jsonify(e.to_dict())


@expenses_bp.delete("/<int:eid>")
@role_required("super_admin", "admin", "accountant")
def delete_expense(eid):
    e = Expense.query.get_or_404(eid)
    audit("delete", "expenses", eid, e.to_dict())
    db.session.delete(e)
    db.session.commit()
    return jsonify({"message": "deleted"})