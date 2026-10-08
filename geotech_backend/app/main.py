import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import Base, engine, SessionLocal
from app.core.init_superadmin import create_superadmin
from app.core.schema_sync import sync_sqlite_schema

from app.modules.users.router import router as user_router
from app.modules.auth.router import router as auth_router
from app.modules.company.router import router as company_router
from app.modules.procurement.router import router as procurement_router
from app.modules.project_expenditures.router import router as project_expenditures_router
from app.modules.projects.router import router as project_router
from app.modules.daily_execution.router import router as daily_execution_router
from app.modules.supervisors.router import router as supervisor_router
from app.modules.vendors.router import router as vendor_router
from app.modules.machinery.router import router as machine_router
from app.modules.dashboard.router import router as dashboard_router
from app.modules.Expenditure.router import router as expenditure_router
from app.modules.analytics.router import router as analytics_router



# ----------------------------------------
# App Factory
# ----------------------------------------
def create_app() -> FastAPI:
    app = FastAPI(
        title="GeoTech Backend API",
        description="Backend APIs for GeoTech Project Management System",
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
    )

    register_middlewares(app)
    register_routes(app)
    register_events(app)

    return app


# ----------------------------------------
# Middlewares
# ----------------------------------------
def _cors_origins() -> list[str]:
    """Allowed browser origins.

    The deployed frontend origin is not known at build time (it is the
    server's public IP), so FRONTEND_URL (e.g. http://<SERVER_IP>) is always
    honoured. Extra origins can be added via CORS_EXTRA_ORIGINS
    (comma-separated) without code changes. Same-origin traffic proxied
    through Nginx (/api/) needs no CORS entry, this covers direct access.
    """
    origins = {
        "https://geotech.com",     # Production frontend
        "http://localhost:5173",   # Development frontend
        "http://127.0.0.1:5173",
        "https://geotech1.vercel.app",
    }
    frontend = (settings.FRONTEND_URL or "").strip().rstrip("/")
    if frontend:
        origins.add(frontend)
    for raw in os.getenv("CORS_EXTRA_ORIGINS", "").split(","):
        origin = raw.strip().rstrip("/")
        if origin:
            origins.add(origin)
    return sorted(origins)


def register_middlewares(app: FastAPI):
    # ✅ CORS (frontend → backend)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Total-Count"],
    )

    # ✅ Security Headers
    @app.middleware("http")
    async def security_headers(request, call_next):
        response = await call_next(request)

        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"

        return response


# ----------------------------------------
# Routes
# ----------------------------------------
def register_routes(app: FastAPI):
    app.include_router(auth_router)
    app.include_router(user_router)
    app.include_router(company_router)
    app.include_router(procurement_router)
    app.include_router(project_expenditures_router)
    app.include_router(project_router)
    app.include_router(daily_execution_router)
    app.include_router(supervisor_router)
    app.include_router(vendor_router)
    app.include_router(machine_router)
    app.include_router(dashboard_router)
    app.include_router(expenditure_router)
    app.include_router(analytics_router)

    @app.get("/", tags=["Health"])
    def root():
        return {"status": "OK", "message": "GeoTech Backend API is running"}


# ----------------------------------------
# Startup / Shutdown Events
# ----------------------------------------
def register_events(app: FastAPI):

    @app.on_event("startup")
    def on_startup():
        # ✅ Create DB tables
        Base.metadata.create_all(bind=engine)
        sync_sqlite_schema()

        # ✅ Create default superadmin
        db = SessionLocal()
        try:
            create_superadmin(db)
        finally:
            db.close()


# ----------------------------------------
# App instance
# ----------------------------------------
app = create_app()

