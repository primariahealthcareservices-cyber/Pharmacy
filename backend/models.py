from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from extensions import db


def iso(d):
    return d.isoformat() if d else None


# ─────────────────────────────  USERS  ─────────────────────────────
class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(150), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(30), nullable=False, default="cashier")
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def set_password(self, pw):
        self.password_hash = generate_password_hash(pw)

    def check_password(self, pw):
        return check_password_hash(self.password_hash, pw)

    def to_dict(self):
        return {"id": self.id, "name": self.name, "email": self.email,
                "role": self.role, "is_active": self.is_active,
                "created_at": iso(self.created_at)}


# ─────────────────────────────  MASTERS  ─────────────────────────────
class Manufacturer(db.Model):
    __tablename__ = "manufacturers"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False, unique=True)
    code = db.Column(db.String(40))
    contact_person = db.Column(db.String(120))
    phone = db.Column(db.String(20))
    email = db.Column(db.String(150))
    address = db.Column(db.Text)
    gst_number = db.Column(db.String(20))
    drug_license = db.Column(db.String(60))
    payment_terms = db.Column(db.String(100))
    credit_limit = db.Column(db.Float, default=0)
    bank_details = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    medicines = db.relationship("Medicine", backref="manufacturer", lazy=True)

    def to_dict(self):
        return {"id": self.id, "name": self.name, "code": self.code,
                "contact_person": self.contact_person, "phone": self.phone,
                "email": self.email, "address": self.address,
                "gst_number": self.gst_number, "drug_license": self.drug_license,
                "payment_terms": self.payment_terms,
                "credit_limit": self.credit_limit or 0,
                "bank_details": self.bank_details,
                "medicine_count": len(self.medicines)}


class Vendor(db.Model):
    __tablename__ = "vendors"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False, unique=True)
    contact_person = db.Column(db.String(120))
    phone = db.Column(db.String(20))
    email = db.Column(db.String(150))
    address = db.Column(db.Text)
    gst_number = db.Column(db.String(20))
    license_number = db.Column(db.String(60))
    payment_terms = db.Column(db.String(100))
    credit_days = db.Column(db.Integer, default=0)
    opening_balance = db.Column(db.Float, default=0)
    credit_limit = db.Column(db.Float, default=0)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {"id": self.id, "name": self.name, "contact_person": self.contact_person,
                "phone": self.phone, "email": self.email, "address": self.address,
                "gst_number": self.gst_number, "license_number": self.license_number,
                "payment_terms": self.payment_terms, "credit_days": self.credit_days or 0,
                "opening_balance": self.opening_balance or 0,
                "credit_limit": self.credit_limit or 0,
                "is_active": self.is_active}


class Customer(db.Model):
    __tablename__ = "customers"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    phone = db.Column(db.String(20), index=True)
    email = db.Column(db.String(150))
    age = db.Column(db.Integer)
    gender = db.Column(db.String(15))
    address = db.Column(db.Text)
    customer_type = db.Column(db.String(30), default="retail")   # retail|wholesale|hospital|corporate|vip|distributor
    doctor_name = db.Column(db.String(150))
    credit_limit = db.Column(db.Float, default=0)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {"id": self.id, "name": self.name, "phone": self.phone,
                "email": self.email, "age": self.age, "gender": self.gender,
                "address": self.address, "customer_type": self.customer_type,
                "doctor_name": self.doctor_name,
                "credit_limit": self.credit_limit or 0,
                "is_active": self.is_active}


class Category(db.Model):
    __tablename__ = "categories"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False, unique=True)
    description = db.Column(db.String(255))

    def to_dict(self):
        return {"id": self.id, "name": self.name, "description": self.description}


# ────────────────────────────  MEDICINES  ────────────────────────────
class Medicine(db.Model):
    """Stock is always tracked in the smallest sellable BASE UNIT (tablet / ml / unit)."""
    __tablename__ = "medicines"
    id = db.Column(db.Integer, primary_key=True)
    sku = db.Column(db.String(60), unique=True, index=True)
    barcode = db.Column(db.String(80), index=True)
    name = db.Column(db.String(200), nullable=False, index=True)
    generic_name = db.Column(db.String(200))
    brand_name = db.Column(db.String(150))
    category_id = db.Column(db.Integer, db.ForeignKey("categories.id"))
    manufacturer_id = db.Column(db.Integer, db.ForeignKey("manufacturers.id"))

    medicine_type = db.Column(db.String(40))          # Tablet, Syrup, Injection...
    dosage_form = db.Column(db.String(60))
    strength = db.Column(db.String(60))
    composition = db.Column(db.Text)
    pack_type = db.Column(db.String(60))
    description = db.Column(db.Text)
    hsn_code = db.Column(db.String(20))
    is_prescription = db.Column(db.Boolean, default=False)

    # ── Packaging hierarchy ──
    base_unit = db.Column(db.String(20), default="tablet")   # tablet / ml / unit
    units_per_strip = db.Column(db.Integer, default=1)
    strips_per_box = db.Column(db.Integer, default=1)
    # units_per_box = units_per_strip * strips_per_box  (computed)

    # ── Pricing (all per BASE UNIT) ──
    gst_rate = db.Column(db.Float, default=12)
    mrp = db.Column(db.Float, default=0)
    cost_price = db.Column(db.Float, default=0)
    selling_price = db.Column(db.Float, default=0)
    wholesale_price = db.Column(db.Float, default=0)
    min_selling_price = db.Column(db.Float, default=0)

    # ── Stock control (base units) ──
    reorder_level = db.Column(db.Integer, default=0)
    max_level = db.Column(db.Integer, default=0)
    rack_location = db.Column(db.String(60))

    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    category = db.relationship("Category", lazy=True)
    batches = db.relationship("Batch", backref="medicine", lazy=True,
                              cascade="all, delete-orphan")

    @property
    def units_per_box(self):
        return (self.units_per_strip or 1) * (self.strips_per_box or 1)

    def stock(self):
        return sum(b.qty for b in self.batches)

    def to_dict(self, with_stock=True):
        d = {
            "id": self.id, "sku": self.sku, "barcode": self.barcode,
            "name": self.name, "generic_name": self.generic_name,
            "brand_name": self.brand_name,
            "category_id": self.category_id,
            "category_name": self.category.name if self.category else None,
            "manufacturer_id": self.manufacturer_id,
            "manufacturer_name": self.manufacturer.name if self.manufacturer else None,
            "medicine_type": self.medicine_type, "dosage_form": self.dosage_form,
            "strength": self.strength, "composition": self.composition,
            "pack_type": self.pack_type, "description": self.description,
            "hsn_code": self.hsn_code, "is_prescription": self.is_prescription,
            "base_unit": self.base_unit,
            "units_per_strip": self.units_per_strip,
            "strips_per_box": self.strips_per_box,
            "units_per_box": self.units_per_box,
            "gst_rate": self.gst_rate, "mrp": self.mrp,
            "cost_price": self.cost_price, "selling_price": self.selling_price,
            "wholesale_price": self.wholesale_price,
            "min_selling_price": self.min_selling_price,
            "reorder_level": self.reorder_level, "max_level": self.max_level,
            "rack_location": self.rack_location, "is_active": self.is_active,
        }
        if with_stock:
            d["stock"] = self.stock()
            d["stock_value"] = round(self.stock() * (self.cost_price or 0), 2)
            d["low_stock"] = self.stock() <= (self.reorder_level or 0)
        return d


# ─────────────────────────────  BATCHES  ─────────────────────────────
class Batch(db.Model):
    __tablename__ = "batches"
    id = db.Column(db.Integer, primary_key=True)
    medicine_id = db.Column(db.Integer, db.ForeignKey("medicines.id"), nullable=False)
    vendor_id = db.Column(db.Integer, db.ForeignKey("vendors.id"))
    batch_no = db.Column(db.String(80), nullable=False, index=True)
    mfg_date = db.Column(db.Date)
    exp_date = db.Column(db.Date, index=True)

    # all prices per BASE UNIT
    cost_price = db.Column(db.Float, default=0)
    mrp = db.Column(db.Float, default=0)
    selling_price = db.Column(db.Float, default=0)
    gst_rate = db.Column(db.Float, default=12)

    qty = db.Column(db.Integer, default=0)            # remaining, base units
    initial_qty = db.Column(db.Integer, default=0)
    free_qty = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    vendor = db.relationship("Vendor", lazy=True)

    def to_dict(self):
        return {
            "id": self.id, "medicine_id": self.medicine_id,
            "medicine_name": self.medicine.name if self.medicine else None,
            "vendor_id": self.vendor_id,
            "vendor_name": self.vendor.name if self.vendor else None,
            "batch_no": self.batch_no,
            "mfg_date": iso(self.mfg_date), "exp_date": iso(self.exp_date),
            "cost_price": self.cost_price, "mrp": self.mrp,
            "selling_price": self.selling_price, "gst_rate": self.gst_rate,
            "qty": self.qty, "initial_qty": self.initial_qty,
            "free_qty": self.free_qty,
            "value": round(self.qty * (self.cost_price or 0), 2),
        }


# ────────────────────────────  PURCHASES  ────────────────────────────
class Purchase(db.Model):
    __tablename__ = "purchase_invoices"
    id = db.Column(db.Integer, primary_key=True)
    invoice_no = db.Column(db.String(80), nullable=False, index=True)
    vendor_id = db.Column(db.Integer, db.ForeignKey("vendors.id"), nullable=False)
    invoice_date = db.Column(db.Date, default=datetime.utcnow)
    received_date = db.Column(db.Date, default=datetime.utcnow)
    sub_total = db.Column(db.Float, default=0)
    discount = db.Column(db.Float, default=0)
    tax_amount = db.Column(db.Float, default=0)
    total = db.Column(db.Float, default=0)
    paid_amount = db.Column(db.Float, default=0)
    due_amount = db.Column(db.Float, default=0)
    status = db.Column(db.String(20), default="unpaid")  # unpaid|partial|paid
    notes = db.Column(db.Text)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    vendor = db.relationship("Vendor", lazy=True)
    items = db.relationship("PurchaseItem", backref="purchase", lazy=True,
                            cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id, "invoice_no": self.invoice_no,
            "vendor_id": self.vendor_id,
            "vendor_name": self.vendor.name if self.vendor else None,
            "invoice_date": iso(self.invoice_date),
            "received_date": iso(self.received_date),
            "sub_total": self.sub_total, "discount": self.discount,
            "tax_amount": self.tax_amount, "total": self.total,
            "paid_amount": self.paid_amount, "due_amount": self.due_amount,
            "status": self.status, "notes": self.notes,
            "created_at": iso(self.created_at),
            "items": [i.to_dict() for i in self.items],
        }


class PurchaseItem(db.Model):
    __tablename__ = "purchase_invoice_items"
    id = db.Column(db.Integer, primary_key=True)
    purchase_id = db.Column(db.Integer, db.ForeignKey("purchase_invoices.id"))
    medicine_id = db.Column(db.Integer, db.ForeignKey("medicines.id"))
    batch_id = db.Column(db.Integer, db.ForeignKey("batches.id"))
    batch_no = db.Column(db.String(80))
    mfg_date = db.Column(db.Date)
    exp_date = db.Column(db.Date)
    quantity = db.Column(db.Integer, default=0)      # in base units
    free_qty = db.Column(db.Integer, default=0)
    cost_price = db.Column(db.Float, default=0)      # per base unit
    mrp = db.Column(db.Float, default=0)
    selling_price = db.Column(db.Float, default=0)
    gst_rate = db.Column(db.Float, default=12)
    discount_percent = db.Column(db.Float, default=0)
    line_total = db.Column(db.Float, default=0)
    returned_qty = db.Column(db.Integer, default=0)

    medicine = db.relationship("Medicine", lazy=True)

    def to_dict(self):
        return {
            "id": self.id, "medicine_id": self.medicine_id,
            "medicine_name": self.medicine.name if self.medicine else None,
            "batch_id": self.batch_id, "batch_no": self.batch_no,
            "mfg_date": iso(self.mfg_date), "exp_date": iso(self.exp_date),
            "quantity": self.quantity, "free_qty": self.free_qty,
            "cost_price": self.cost_price, "mrp": self.mrp,
            "selling_price": self.selling_price, "gst_rate": self.gst_rate,
            "discount_percent": self.discount_percent,
            "line_total": self.line_total, "returned_qty": self.returned_qty,
        }


class PurchaseReturn(db.Model):
    __tablename__ = "purchase_returns"
    id = db.Column(db.Integer, primary_key=True)
    purchase_id = db.Column(db.Integer, db.ForeignKey("purchase_invoices.id"))
    vendor_id = db.Column(db.Integer, db.ForeignKey("vendors.id"))
    return_date = db.Column(db.Date, default=datetime.utcnow)
    reason = db.Column(db.String(255))
    total = db.Column(db.Float, default=0)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    items = db.relationship("PurchaseReturnItem", backref="purchase_return",
                            lazy=True, cascade="all, delete-orphan")

    def to_dict(self):
        return {"id": self.id, "purchase_id": self.purchase_id,
                "vendor_id": self.vendor_id, "return_date": iso(self.return_date),
                "reason": self.reason, "total": self.total,
                "items": [i.to_dict() for i in self.items]}


class PurchaseReturnItem(db.Model):
    __tablename__ = "purchase_return_items"
    id = db.Column(db.Integer, primary_key=True)
    purchase_return_id = db.Column(db.Integer, db.ForeignKey("purchase_returns.id"))
    medicine_id = db.Column(db.Integer, db.ForeignKey("medicines.id"))
    batch_id = db.Column(db.Integer, db.ForeignKey("batches.id"))
    quantity = db.Column(db.Integer, default=0)
    cost_price = db.Column(db.Float, default=0)
    line_total = db.Column(db.Float, default=0)

    medicine = db.relationship("Medicine", lazy=True)

    def to_dict(self):
        return {"id": self.id, "medicine_id": self.medicine_id,
                "medicine_name": self.medicine.name if self.medicine else None,
                "batch_id": self.batch_id, "quantity": self.quantity,
                "cost_price": self.cost_price, "line_total": self.line_total}


# ──────────────────────────────  SALES  ──────────────────────────────
class Sale(db.Model):
    __tablename__ = "sales"
    id = db.Column(db.Integer, primary_key=True)
    invoice_no = db.Column(db.String(60), unique=True, index=True)
    customer_id = db.Column(db.Integer, db.ForeignKey("customers.id"))
    sale_date = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    sub_total = db.Column(db.Float, default=0)
    discount = db.Column(db.Float, default=0)
    tax_amount = db.Column(db.Float, default=0)
    total = db.Column(db.Float, default=0)
    cogs = db.Column(db.Float, default=0)            # cost of goods sold
    profit = db.Column(db.Float, default=0)
    paid_amount = db.Column(db.Float, default=0)
    due_amount = db.Column(db.Float, default=0)
    payment_status = db.Column(db.String(20), default="paid")  # paid|partial|unpaid
    payment_mode = db.Column(db.String(40), default="cash")
    prescription_no = db.Column(db.String(80))
    doctor_name = db.Column(db.String(150))
    notes = db.Column(db.Text)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    is_returned = db.Column(db.Boolean, default=False)

    customer = db.relationship("Customer", lazy=True)
    items = db.relationship("SaleItem", backref="sale", lazy=True,
                            cascade="all, delete-orphan")
    payments = db.relationship("SalePayment", backref="sale", lazy=True,
                               cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id, "invoice_no": self.invoice_no,
            "customer_id": self.customer_id,
            "customer_name": self.customer.name if self.customer else "Walk-in",
            "customer_phone": self.customer.phone if self.customer else None,
            "sale_date": iso(self.sale_date),
            "sub_total": self.sub_total, "discount": self.discount,
            "tax_amount": self.tax_amount, "total": self.total,
            "cogs": self.cogs, "profit": self.profit,
            "paid_amount": self.paid_amount, "due_amount": self.due_amount,
            "payment_status": self.payment_status,
            "payment_mode": self.payment_mode,
            "prescription_no": self.prescription_no,
            "doctor_name": self.doctor_name, "notes": self.notes,
            "is_returned": self.is_returned,
            "items": [i.to_dict() for i in self.items],
            "payments": [p.to_dict() for p in self.payments],
        }


class SaleItem(db.Model):
    __tablename__ = "sale_items"
    id = db.Column(db.Integer, primary_key=True)
    sale_id = db.Column(db.Integer, db.ForeignKey("sales.id"))
    medicine_id = db.Column(db.Integer, db.ForeignKey("medicines.id"))
    batch_id = db.Column(db.Integer, db.ForeignKey("batches.id"))
    batch_no = db.Column(db.String(80))
    exp_date = db.Column(db.Date)
    quantity = db.Column(db.Integer, default=0)      # base units
    unit_label = db.Column(db.String(20), default="unit")
    mrp = db.Column(db.Float, default=0)             # per base unit
    selling_price = db.Column(db.Float, default=0)   # per base unit
    cost_price = db.Column(db.Float, default=0)      # per base unit
    discount_percent = db.Column(db.Float, default=0)
    gst_rate = db.Column(db.Float, default=12)
    tax_amount = db.Column(db.Float, default=0)
    line_total = db.Column(db.Float, default=0)
    profit = db.Column(db.Float, default=0)
    returned_qty = db.Column(db.Integer, default=0)

    medicine = db.relationship("Medicine", lazy=True)

    def to_dict(self):
        return {
            "id": self.id, "medicine_id": self.medicine_id,
            "medicine_name": self.medicine.name if self.medicine else None,
            "batch_id": self.batch_id, "batch_no": self.batch_no,
            "exp_date": iso(self.exp_date),
            "quantity": self.quantity, "unit_label": self.unit_label,
            "mrp": self.mrp, "selling_price": self.selling_price,
            "cost_price": self.cost_price,
            "discount_percent": self.discount_percent,
            "gst_rate": self.gst_rate, "tax_amount": self.tax_amount,
            "line_total": self.line_total, "profit": self.profit,
            "returned_qty": self.returned_qty,
        }


class SalePayment(db.Model):
    __tablename__ = "sale_payments"
    id = db.Column(db.Integer, primary_key=True)
    sale_id = db.Column(db.Integer, db.ForeignKey("sales.id"))
    mode = db.Column(db.String(30), default="cash")   # cash|upi|card|bank|credit
    amount = db.Column(db.Float, default=0)
    reference = db.Column(db.String(120))
    paid_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {"id": self.id, "mode": self.mode, "amount": self.amount,
                "reference": self.reference, "paid_at": iso(self.paid_at)}


class SalesReturn(db.Model):
    __tablename__ = "sales_returns"
    id = db.Column(db.Integer, primary_key=True)
    sale_id = db.Column(db.Integer, db.ForeignKey("sales.id"))
    customer_id = db.Column(db.Integer, db.ForeignKey("customers.id"))
    return_date = db.Column(db.DateTime, default=datetime.utcnow)
    reason = db.Column(db.String(255))
    total = db.Column(db.Float, default=0)
    refund_mode = db.Column(db.String(30), default="cash")
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    items = db.relationship("SalesReturnItem", backref="sales_return",
                            lazy=True, cascade="all, delete-orphan")

    def to_dict(self):
        return {"id": self.id, "sale_id": self.sale_id,
                "customer_id": self.customer_id,
                "return_date": iso(self.return_date), "reason": self.reason,
                "total": self.total, "refund_mode": self.refund_mode,
                "items": [i.to_dict() for i in self.items]}


class SalesReturnItem(db.Model):
    __tablename__ = "sales_return_items"
    id = db.Column(db.Integer, primary_key=True)
    sales_return_id = db.Column(db.Integer, db.ForeignKey("sales_returns.id"))
    medicine_id = db.Column(db.Integer, db.ForeignKey("medicines.id"))
    batch_id = db.Column(db.Integer, db.ForeignKey("batches.id"))
    quantity = db.Column(db.Integer, default=0)
    selling_price = db.Column(db.Float, default=0)
    line_total = db.Column(db.Float, default=0)

    medicine = db.relationship("Medicine", lazy=True)

    def to_dict(self):
        return {"id": self.id, "medicine_id": self.medicine_id,
                "medicine_name": self.medicine.name if self.medicine else None,
                "batch_id": self.batch_id, "quantity": self.quantity,
                "selling_price": self.selling_price, "line_total": self.line_total}


# ─────────────────────────  EXPENSES  ─────────────────────────
class ExpenseCategory(db.Model):
    __tablename__ = "expense_categories"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), unique=True, nullable=False)
    description = db.Column(db.String(255))

    def to_dict(self):
        return {"id": self.id, "name": self.name, "description": self.description}


class Expense(db.Model):
    __tablename__ = "expenses"
    id = db.Column(db.Integer, primary_key=True)
    category_id = db.Column(db.Integer, db.ForeignKey("expense_categories.id"))
    amount = db.Column(db.Float, default=0)
    expense_date = db.Column(db.Date, default=datetime.utcnow, index=True)
    payment_mode = db.Column(db.String(30), default="cash")
    vendor_id = db.Column(db.Integer, db.ForeignKey("vendors.id"))
    description = db.Column(db.String(255))
    reference = db.Column(db.String(120))
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    category = db.relationship("ExpenseCategory", lazy=True)
    vendor = db.relationship("Vendor", lazy=True)

    def to_dict(self):
        return {"id": self.id, "category_id": self.category_id,
                "category_name": self.category.name if self.category else None,
                "amount": self.amount, "expense_date": iso(self.expense_date),
                "payment_mode": self.payment_mode, "vendor_id": self.vendor_id,
                "vendor_name": self.vendor.name if self.vendor else None,
                "description": self.description, "reference": self.reference}


# ─────────────────────────  PAYMENTS  ─────────────────────────
class CustomerPayment(db.Model):
    __tablename__ = "customer_payments"
    id = db.Column(db.Integer, primary_key=True)
    customer_id = db.Column(db.Integer, db.ForeignKey("customers.id"), nullable=False)
    sale_id = db.Column(db.Integer, db.ForeignKey("sales.id"))
    amount = db.Column(db.Float, default=0)
    mode = db.Column(db.String(30), default="cash")
    payment_date = db.Column(db.DateTime, default=datetime.utcnow)
    reference = db.Column(db.String(120))
    notes = db.Column(db.String(255))
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"))

    customer = db.relationship("Customer", lazy=True)

    def to_dict(self):
        return {"id": self.id, "customer_id": self.customer_id,
                "customer_name": self.customer.name if self.customer else None,
                "sale_id": self.sale_id, "amount": self.amount, "mode": self.mode,
                "payment_date": iso(self.payment_date),
                "reference": self.reference, "notes": self.notes}


class VendorPayment(db.Model):
    __tablename__ = "vendor_payments"
    id = db.Column(db.Integer, primary_key=True)
    vendor_id = db.Column(db.Integer, db.ForeignKey("vendors.id"), nullable=False)
    purchase_id = db.Column(db.Integer, db.ForeignKey("purchase_invoices.id"))
    amount = db.Column(db.Float, default=0)
    mode = db.Column(db.String(30), default="cash")
    payment_date = db.Column(db.DateTime, default=datetime.utcnow)
    reference = db.Column(db.String(120))
    notes = db.Column(db.String(255))
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"))

    vendor = db.relationship("Vendor", lazy=True)

    def to_dict(self):
        return {"id": self.id, "vendor_id": self.vendor_id,
                "vendor_name": self.vendor.name if self.vendor else None,
                "purchase_id": self.purchase_id, "amount": self.amount,
                "mode": self.mode, "payment_date": iso(self.payment_date),
                "reference": self.reference, "notes": self.notes}


# ─────────────────────  STOCK ADJUSTMENTS  ─────────────────────
class StockAdjustment(db.Model):
    __tablename__ = "stock_adjustments"
    id = db.Column(db.Integer, primary_key=True)
    medicine_id = db.Column(db.Integer, db.ForeignKey("medicines.id"))
    batch_id = db.Column(db.Integer, db.ForeignKey("batches.id"))
    qty_change = db.Column(db.Integer, default=0)     # +/-
    reason = db.Column(db.String(80))                 # damaged|lost|expired|theft|count_error|opening
    notes = db.Column(db.String(255))
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    medicine = db.relationship("Medicine", lazy=True)
    batch = db.relationship("Batch", lazy=True)

    def to_dict(self):
        return {"id": self.id, "medicine_id": self.medicine_id,
                "medicine_name": self.medicine.name if self.medicine else None,
                "batch_id": self.batch_id,
                "batch_no": self.batch.batch_no if self.batch else None,
                "qty_change": self.qty_change, "reason": self.reason,
                "notes": self.notes, "created_at": iso(self.created_at)}


# ─────────────────────────  AUDIT LOG  ─────────────────────────
class AuditLog(db.Model):
    __tablename__ = "audit_logs"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    user_name = db.Column(db.String(120))
    action = db.Column(db.String(40))     # create|update|delete|login
    entity = db.Column(db.String(60))
    entity_id = db.Column(db.Integer)
    old_value = db.Column(db.Text)
    new_value = db.Column(db.Text)
    ip = db.Column(db.String(60))
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)

    def to_dict(self):
        return {"id": self.id, "user_id": self.user_id,
                "user_name": self.user_name, "action": self.action,
                "entity": self.entity, "entity_id": self.entity_id,
                "old_value": self.old_value, "new_value": self.new_value,
                "ip": self.ip, "created_at": iso(self.created_at)}