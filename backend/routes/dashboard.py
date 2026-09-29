from flask import Blueprint, jsonify
from datetime import date, datetime, timedelta
from sqlalchemy import func
from extensions import db
from models import (Sale, SaleItem, Purchase, PurchaseItem, Expense, Medicine,
                    Batch, Customer, Vendor, SalesReturn)
from utils.auth import role_required

dashboard_bp = Blueprint("dashboard", __name__)


@dashboard_bp.get("/summary")
@role_required()
def summary():
    today = date.today()
    month_start = today.replace(day=1)

    def sales_range(start, end=None):
        q = Sale.query.filter(Sale.sale_date >= datetime.combine(start, datetime.min.time()))
        if end:
            q = q.filter(Sale.sale_date <= datetime.combine(end, datetime.max.time()))
        return q.all()

    today_sales = sales_range(today)
    month_sales = sales_range(month_start)

    today_purchases = (Purchase.query
                       .filter(Purchase.invoice_date == today).all())
    today_expenses = (Expense.query
                      .filter(Expense.expense_date == today).all())
    month_expenses = (Expense.query
                      .filter(Expense.expense_date >= month_start).all())

    def agg(sales):
        revenue = sum(s.total or 0 for s in sales)
        profit = sum(s.profit or 0 for s in sales)
        return round(revenue, 2), round(profit, 2)

    today_rev, today_profit = agg(today_sales)
    month_rev, month_profit = agg(month_sales)

    total_stock_value = 0.0
    total_products = Medicine.query.filter(Medicine.is_active.is_(True)).count()
    expiring_30 = 0
    expired = 0
    low_stock_count = 0

    for b in Batch.query.filter(Batch.qty > 0).all():
        total_stock_value += b.qty * (b.cost_price or 0)
        if b.exp_date:
            days = (b.exp_date - today).days
            if days < 0:
                expired += 1
            elif days <= 30:
                expiring_30 += 1

    for m in Medicine.query.filter(Medicine.is_active.is_(True)).all():
        if m.stock() <= (m.reorder_level or 0):
            low_stock_count += 1

    pending_customer = db.session.query(func.coalesce(func.sum(Sale.due_amount), 0)).scalar()
    pending_vendor = db.session.query(func.coalesce(func.sum(Purchase.due_amount), 0)).scalar()

    # Payment-mode split (today)
    modes = {}
    for s in today_sales:
        for p in s.payments:
            modes[p.mode] = round(modes.get(p.mode, 0) + (p.amount or 0), 2)

    # Top selling (30 days)
    start_30 = today - timedelta(days=30)
    top = (db.session.query(Medicine.name,
                            func.sum(SaleItem.quantity).label("qty"),
                            func.sum(SaleItem.line_total).label("amount"))
           .join(SaleItem, SaleItem.medicine_id == Medicine.id)
           .join(Sale, Sale.id == SaleItem.sale_id)
           .filter(Sale.sale_date >= datetime.combine(start_30, datetime.min.time()))
           .group_by(Medicine.id)
           .order_by(func.sum(SaleItem.quantity).desc())
           .limit(10).all())

    return jsonify({
        "today": {"sales": today_rev, "profit": today_profit,
                  "purchases": round(sum(p.total or 0 for p in today_purchases), 2),
                  "expenses": round(sum(e.amount or 0 for e in today_expenses), 2),
                  "net_profit": round(today_profit - sum(e.amount or 0 for e in today_expenses), 2)},
        "month": {"revenue": month_rev, "profit": month_profit,
                  "expenses": round(sum(e.amount or 0 for e in month_expenses), 2),
                  "net_profit": round(month_profit - sum(e.amount or 0 for e in month_expenses), 2)},
        "stock": {"total_value": round(total_stock_value, 2),
                  "total_products": total_products,
                  "low_stock": low_stock_count,
                  "expiring_30": expiring_30,
                  "expired": expired},
        "pending": {"customer_payments": round(pending_customer or 0, 2),
                    "vendor_payments": round(pending_vendor or 0, 2)},
        "collections_today": modes,
        "top_selling": [{"name": n, "qty": int(q), "amount": round(a or 0, 2)} for n, q, a in top],
        "counts": {"customers": Customer.query.count(), "vendors": Vendor.query.count()},
    })


@dashboard_bp.get("/charts")
@role_required()
def charts():
    today = date.today()
    start = today - timedelta(days=29)

    # Daily sales & profit (30 days)
    rows = (db.session.query(func.date(Sale.sale_date).label("d"),
                             func.sum(Sale.total), func.sum(Sale.profit))
            .filter(Sale.sale_date >= datetime.combine(start, datetime.min.time()))
            .group_by(func.date(Sale.sale_date)).all())
    sales_map = {str(r[0]): {"revenue": round(r[1] or 0, 2), "profit": round(r[2] or 0, 2)}
                 for r in rows}

    # Purchases per day
    prows = (db.session.query(func.date(Purchase.invoice_date), func.sum(Purchase.total))
             .filter(Purchase.invoice_date >= start)
             .group_by(func.date(Purchase.invoice_date)).all())
    purchase_map = {str(r[0]): round(r[1] or 0, 2) for r in prows}

    # Expenses per day
    erows = (db.session.query(func.date(Expense.expense_date), func.sum(Expense.amount))
             .filter(Expense.expense_date >= start)
             .group_by(func.date(Expense.expense_date)).all())
    expense_map = {str(r[0]): round(r[1] or 0, 2) for r in erows}

    series = []
    for i in range(30):
        d = (start + timedelta(days=i)).isoformat()
        s = sales_map.get(d, {"revenue": 0, "profit": 0})
        series.append({
            "date": d,
            "revenue": s["revenue"],
            "profit": s["profit"],
            "purchases": purchase_map.get(d, 0),
            "expenses": expense_map.get(d, 0),
        })

    return jsonify({"daily": series})