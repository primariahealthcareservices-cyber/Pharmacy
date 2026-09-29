from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from extensions import db
from models import User
from utils.auth import role_required
from utils.helpers import audit

auth_bp = Blueprint("auth", __name__)


@auth_bp.post("/login")
def login():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        return jsonify({"message": "Invalid email or password"}), 401
    if not user.is_active:
        return jsonify({"message": "Account disabled"}), 403
    token = create_access_token(
        identity=str(user.id),
        additional_claims={"role": user.role, "name": user.name},
    )
    audit("login", "user", user.id)
    db.session.commit()
    return jsonify({"token": token, "user": user.to_dict()})


@auth_bp.get("/me")
@role_required()
def me():
    user = User.query.get(int(get_jwt_identity()))
    return jsonify(user.to_dict())


@auth_bp.get("/users")
@role_required("super_admin", "admin")
def list_users():
    return jsonify([u.to_dict() for u in User.query.order_by(User.id).all()])


@auth_bp.post("/users")
@role_required("super_admin", "admin")
def create_user():
    d = request.get_json() or {}
    if not d.get("email") or not d.get("password"):
        return jsonify({"message": "email and password required"}), 400
    if User.query.filter_by(email=d["email"].lower()).first():
        return jsonify({"message": "Email already exists"}), 409
    u = User(name=d.get("name") or d["email"], email=d["email"].lower(),
             role=d.get("role", "cashier"), is_active=d.get("is_active", True))
    u.set_password(d["password"])
    db.session.add(u)
    audit("create", "user", None, None, u.email)
    db.session.commit()
    return jsonify(u.to_dict()), 201


@auth_bp.put("/users/<int:uid>")
@role_required("super_admin", "admin")
def update_user(uid):
    u = User.query.get_or_404(uid)
    d = request.get_json() or {}
    old = u.to_dict()
    for f in ("name", "role", "is_active"):
        if f in d:
            setattr(u, f, d[f])
    if d.get("email"):
        u.email = d["email"].lower()
    if d.get("password"):
        u.set_password(d["password"])
    audit("update", "user", uid, old, u.to_dict())
    db.session.commit()
    return jsonify(u.to_dict())


@auth_bp.delete("/users/<int:uid>")
@role_required("super_admin")
def delete_user(uid):
    u = User.query.get_or_404(uid)
    audit("delete", "user", uid, u.to_dict())
    db.session.delete(u)
    db.session.commit()
    return jsonify({"message": "deleted"})