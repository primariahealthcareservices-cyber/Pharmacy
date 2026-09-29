from flask import Flask, jsonify
from flask_cors import CORS
from config import Config
from extensions import db, jwt


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    CORS(app, resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}},
         supports_credentials=True)

    db.init_app(app)
    jwt.init_app(app)

    from routes.auth import auth_bp
    from routes.masters import masters_bp
    from routes.medicines import medicines_bp
    from routes.purchases import purchases_bp
    from routes.sales import sales_bp
    from routes.inventory import inventory_bp
    from routes.expenses import expenses_bp
    from routes.payments import payments_bp
    from routes.dashboard import dashboard_bp
    from routes.reports import reports_bp

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(masters_bp, url_prefix="/api")
    app.register_blueprint(medicines_bp, url_prefix="/api/medicines")
    app.register_blueprint(purchases_bp, url_prefix="/api/purchases")
    app.register_blueprint(sales_bp, url_prefix="/api/sales")
    app.register_blueprint(inventory_bp, url_prefix="/api/inventory")
    app.register_blueprint(expenses_bp, url_prefix="/api/expenses")
    app.register_blueprint(payments_bp, url_prefix="/api/payments")
    app.register_blueprint(dashboard_bp, url_prefix="/api/dashboard")
    app.register_blueprint(reports_bp, url_prefix="/api/reports")

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok"})

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"message": "Not found"}), 404

    @app.errorhandler(500)
    def server_error(e):
        db.session.rollback()
        return jsonify({"message": "Internal server error"}), 500

    return app


app = create_app()

if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    app.run(debug=True, port=5000)