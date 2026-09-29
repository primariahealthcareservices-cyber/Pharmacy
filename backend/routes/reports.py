from flask import Blueprint, request, jsonify
from datetime import date, datetime, timedelta
from sqlalchemy import func
from extensions import db
from models import (Sale, SaleItem, Purchase, PurchaseItem, Expense, Medicine,
                    Batch, Customer, Vendor, SalesReturn, PurchaseReturn, Category)
from utils.auth import role_required
from utils.helpers import parse_date

reports_bp = Blueprint("reports", __name__)


def _range():
    today = date.today()
    frm = parse_date(request.args.get("from")) or today.replace(day=1)
    to = parse_date(request.args.get("to")) or today
    return frm, to


@reports_bp.get("/sales")
@role_required()
def sales_report():
    frm, to = _range()
    sales = (Sale.query
             .filter(Sale.sale_date >= datetime.combine(frm, datetime.min.time()))
             .filter(Sale.sale_date <= datetime.combine(to, datetime.max.time()))
             .all())
    total = sum(s.total or 0 for s in sales)
    tax = sum(s.tax_amount or 0 for s in sales)
    profit = sum(s.profit or 0 for s in sales)
    discount = sum(s.discount or 0 for s in sales)

    by_day = {}
    by_mode = {}
    for s in sales:
        d = s.sale_date.date().isoformat()
        by_day[d] = round(by_day.get(d, 0) + (s.total or 0), 2)
        for p in s.payments:
            by_mode[p.mode] = round(by_mode.get(p.mode, 0) + (p.amount or 0), 2)

    return jsonify({
        "from": frm.isoformat(), "to": to.isoformat(),
        "count": len(sales), "total": round(total, 2),
        "tax": round(tax, 2), "profit": round(profit, 2),
        "discount": round(discount, 2),
        "by_day": [{"date": k, "amount": v} for k, v in sorted(by_day.items())],
        "by_mode": by_mode,
    })


@reports_bp.get("/products")
@role_required()
def product_report():
    frm, to = _range()
    rows = (db.session.query(
                Medicine.id, Medicine.name,
                func.sum(SaleItem.quantity).label("qty"),
                func.sum(SaleItem.line_total).label("revenue"),
                func.sum(SaleItem.profit).label("profit"))
            .join(SaleItem, SaleItem.medicine_id == Medicine.id)
            .join(Sale, Sale.id == SaleItem.sale_id)
            .filter(Sale.sale_date >= datetime.combine(frm, datetime.min.time()))
            .filter(Sale.sale_date <= datetime.combine(to, datetime.max.time()))
            .group_by(Medicine.id)
            .order_by(func.sum(SaleItem.line_total).desc())
            .all())
    return jsonify([{
        "medicine_id": r[0], "name": r[1], "qty_sold": int(r[2] or 0),
        "revenue": round(r[3] or 0, 2), "profit": round(r[4] or 0, 2),
    } for r in rows])


@reports_bp.get("/profit")
@role_required()
def profit_report():
    frm, to = _range()
    sales = (Sale.query
             .filter(Sale.sale_date >= datetime.combine(frm, datetime.min.time()))
             .filter(Sale.sale_date <= datetime.combine(to, datetime.max.time())).all())
    net_sales = sum(s.total or 0 for s in sales)
    cogs = sum(s.cogs or 0 for s in sales)
    gross = round(net_sales - cogs, 2)

    expenses = (Expense.query
                .filter(Expense.expense_date >= frm)
                .filter(Expense.expense_date <= to).all())
    total_expense = round(sum(e.amount or 0 for e in expenses), 2)

    by_cat = {}
    for e in expenses:
        name = e.category.name if e.category else "Uncategorised"
        by_cat[name] = round(by_cat.get(name, 0) + (e.amount or 0), 2)

    return jsonify({
        "from": frm.isoformat(), "to": to.isoformat(),
        "net_sales": round(net_sales, 2),
        "cogs": round(cogs, 2),
        "gross_profit": gross,
        "gross_margin_pct": round((gross / net_sales * 100) if net_sales else 0, 2),
        "expenses": total_expense,
        "net_profit": round(gross - total_expense, 2),
        "expenses_by_category": by_cat,
    })


@reports_bp.get("/stock")
@role_required()
def stock_report():
    rows = []
    for m in Medicine.query.filter(Medicine.is_active.is_(True)).all():
        batches = [b for b in m.batches if b.qty > 0]
        qty = sum(b.qty for b in batches)
        cost_val = sum(b.qty * (b.cost_price or 0) for b in batches)
        mrp_val = sum(b.qty * (b.mrp or 0) for b in batches)
        if qty == 0 and request.args.get("in_stock_only") == "1":
            continue
        rows.append({
            "medicine_id": m.id, "name": m.name,
            "category": m.category.name if m.category else None,
            "stock": qty, "base_unit": m.base_unit,
            "cost_value": round(cost_val, 2), "mrp_value": round(mrp_val, 2),
            "reorder_level": m.reorder_level,
            "status": "low" if qty <= (m.reorder_level or 0) else "ok",
        })
    return jsonify(rows)


@reports_bp.get("/expiry")
@role_required()
def expiry_report():
    today = date.today()
    rows = []
    for b in Batch.query.filter(Batch.qty > 0).all():
        if not b.exp_date:
            continue
        days = (b.exp_date - today).days
        rows.append({**b.to_dict(), "days_left": days,
                     "status": ("expired" if days < 0 else
                                "critical" if days <= 30 else
                                "warning" if days <= 90 else "ok")})
    rows.sort(key=lambda r: r["days_left"])
    return jsonify(rows)


@reports_bp.get("/customers")
@role_required()
def customer_report():
    frm, to = _range()
    rows = (db.session.query(Customer.id, Customer.name, Customer.phone,
                             func.sum(Sale.total), func.count(Sale.id))
            .join(Sale, Sale.customer_id == Customer.id)
            .filter(Sale.sale_date >= datetime.combine(frm, datetime.min.time()))
            .filter(Sale.sale_date <= datetime.combine(to, datetime.max.time()))
            .group_by(Customer.id)
            .order_by(func.sum(Sale.total).desc()).all())
    return jsonify([{"customer_id": r[0], "name": r[1], "phone": r[2],
                     "revenue": round(r[3] or 0, 2), "orders": int(r[4] or 0)}
                    for r in rows])


@reports_bp.get("/vendors")
@role_required()
def vendor_report():
    frm, to = _range()
    rows = (db.session.query(Vendor.id, Vendor.name,
                             func.sum(Purchase.total), func.count(Purchase.id))
            .join(Purchase, Purchase.vendor_id == Vendor.id)
            .filter(Purchase.invoice_date >= frm)
            .filter(Purchase.invoice_date <= to)
            .group_by(Vendor.id)
            .order_by(func.sum(Purchase.total).desc()).all())
    return jsonify([{"vendor_id": r[0], "name": r[1],
                     "purchases": round(r[2] or 0, 2), "invoices": int(r[3] or 0)}
                    for r in rows])