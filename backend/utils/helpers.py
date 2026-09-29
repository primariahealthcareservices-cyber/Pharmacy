from datetime import date, datetime
from models import AuditLog
from extensions import db
from flask import request
from flask_jwt_extended import get_jwt_identity, get_jwt


UNIT_FACTORS = ("base", "strip", "box")


def parse_date(v):
    if not v:
        return None
    if isinstance(v, date):
        return v
    try:
        return datetime.strptime(str(v)[:10], "%Y-%m-%d").date()
    except Exception:
        return None


def parse_dt(v):
    if not v:
        return None
    if isinstance(v, datetime):
        return v
    try:
        return datetime.fromisoformat(str(v))
    except Exception:
        return None


def unit_factor(medicine, unit):
    """How many base units in 1 of `unit`."""
    unit = (unit or "base").lower()
    if unit in ("box", "pack"):
        return medicine.units_per_box or 1
    if unit in ("strip", "sheet", "blister"):
        return medicine.units_per_strip or 1
    return 1


def to_base_qty(medicine, qty, unit):
    return int(round(float(qty) * unit_factor(medicine, unit)))


def to_base_price(price, medicine, unit):
    return round(float(price) / unit_factor(medicine, unit), 6)


def audit(action, entity, entity_id=None, old=None, new=None):
    try:
        uid = int(get_jwt_identity())
        claims = get_jwt()
        name = claims.get("name", "system")
    except Exception:
        uid, name = None, "system"
    log = AuditLog(user_id=uid, user_name=name, action=action, entity=entity,
                   entity_id=entity_id,
                   old_value=str(old)[:2000] if old else None,
                   new_value=str(new)[:2000] if new else None,
                   ip=request.remote_addr if request else None)
    db.session.add(log)


def money(v):
    return round(float(v or 0), 2)