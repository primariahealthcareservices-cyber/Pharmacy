"""Run: python seed.py  — creates tables and demo data."""
from datetime import date, timedelta
from app import create_app
from extensions import db
from models import (User, Manufacturer, Vendor, Customer, Category, Medicine,
                    ExpenseCategory, Expense, Batch)

app = create_app()

with app.app_context():
    db.create_all()

    if not User.query.filter_by(email="admin@pharmacy.com").first():
        u = User(name="Super Admin", email="admin@pharmacy.com", role="super_admin")
        u.set_password("admin123")
        db.session.add(u)

    if not ExpenseCategory.query.first():
        for n in ["Rent", "Electricity", "Salaries", "Internet", "Transport",
                  "Maintenance", "Software", "Packaging", "Delivery",
                  "Marketing", "Repairs", "Miscellaneous"]:
            db.session.add(ExpenseCategory(name=n))

    if not Category.query.first():
        for n in ["Analgesic", "Antibiotic", "Antihistamine", "Antacid",
                  "Vitamin", "Cardiac", "Diabetes", "Respiratory"]:
            db.session.add(Category(name=n))
    db.session.commit()

    if not Manufacturer.query.first():
        for n in ["ABC Pharma", "Cipla Ltd", "Sun Pharma", "Dr. Reddy's"]:
            db.session.add(Manufacturer(name=n, phone="9876543210",
                                        gst_number="29ABCDE1234F1Z5"))
    if not Vendor.query.first():
        for n in ["MedPlus Distributors", "Apollo Wholesale", "HealthKart Supply"]:
            db.session.add(Vendor(name=n, phone="9988776655",
                                  gst_number="29XYZAB5678G1Z2",
                                  payment_terms="Net 30", credit_days=30))
    if not Customer.query.first():
        db.session.add(Customer(name="Walk-in Customer", customer_type="retail"))
        db.session.add(Customer(name="Rahul Sharma", phone="9000000001",
                                customer_type="retail", age=32, gender="Male"))
        db.session.add(Customer(name="ABC Hospital", phone="9000000002",
                                customer_type="hospital", credit_limit=100000))
    db.session.commit()

    cat = {c.name: c.id for c in Category.query.all()}
    man = {m.name: m.id for m in Manufacturer.query.all()}

    if not Medicine.query.first():
        demo = [
            dict(name="Paracetamol 500mg", generic_name="Paracetamol", strength="500mg",
                 category_id=cat.get("Analgesic"), manufacturer_id=man.get("ABC Pharma"),
                 medicine_type="Tablet", base_unit="tablet", units_per_strip=10,
                 strips_per_box=10, gst_rate=12, mrp=3.5, cost_price=2.5,
                 selling_price=3.2, wholesale_price=2.9, reorder_level=100, max_level=2000),
            dict(name="Azithromycin 250mg", generic_name="Azithromycin", strength="250mg",
                 category_id=cat.get("Antibiotic"), manufacturer_id=man.get("Cipla Ltd"),
                 medicine_type="Tablet", base_unit="tablet", units_per_strip=6,
                 strips_per_box=10, gst_rate=12, mrp=12, cost_price=8,
                 selling_price=10.5, reorder_level=50, max_level=1000),
            dict(name="Cetirizine 10mg", generic_name="Cetirizine", strength="10mg",
                 category_id=cat.get("Antihistamine"), manufacturer_id=man.get("Sun Pharma"),
                 medicine_type="Tablet", base_unit="tablet", units_per_strip=10,
                 strips_per_box=10, gst_rate=12, mrp=2.5, cost_price=1.4,
                 selling_price=2.2, reorder_level=100, max_level=1500),
            dict(name="ORS Powder", generic_name="Oral Rehydration Salt",
                 category_id=cat.get("Vitamin"), manufacturer_id=man.get("Dr. Reddy's"),
                 medicine_type="Powder", base_unit="packet", units_per_strip=1,
                 strips_per_box=25, gst_rate=12, mrp=22, cost_price=14,
                 selling_price=20, reorder_level=30, max_level=500),
        ]
        for d in demo:
            m = Medicine(**d)
            db.session.add(m)
        db.session.commit()

        # initial batches
        today = date.today()
        for m in Medicine.query.all():
            for i, months in enumerate([18, 8]):
                b = Batch(medicine_id=m.id, vendor_id=1,
                          batch_no=f"{m.id}00{i+1}",
                          mfg_date=today - timedelta(days=60),
                          exp_date=today + timedelta(days=30 * months),
                          cost_price=m.cost_price, mrp=m.mrp,
                          selling_price=m.selling_price, gst_rate=m.gst_rate,
                          qty=0, initial_qty=0)
                db.session.add(b)
                db.session.flush()
                b.qty = m.units_per_box * (5 if i == 0 else 3)
                b.initial_qty = b.qty
        db.session.commit()

    print("✅ Seed complete")
    print("   Login: admin@pharmacy.com / admin123")