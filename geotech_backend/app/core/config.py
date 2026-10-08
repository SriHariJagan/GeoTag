from dotenv import load_dotenv
import os

load_dotenv()


def _get(key: str, default: str = "") -> str:
    value = os.getenv(key, default)
    # Strip whitespace (fixes " http://..." leading-space bugs in .env)
    if isinstance(value, str):
        value = value.strip().strip('"').strip("'")
    return value


class Settings:
    PROJECT_NAME: str = "GeoTech"
    ENV: str = _get("ENV", "development").lower() or "development"

    DATABASE_URL: str = _get(
        "DATABASE_URL", "sqlite:///./geotech.db"
    )

    # 🔐 JWT settings
    # NOTE: default is dev-only. Production must set a strong SECRET_KEY.
    SECRET_KEY: str = _get("SECRET_KEY", "supersecretkey")
    ALGORITHM: str = _get("ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(
        _get("ACCESS_TOKEN_EXPIRE_MINUTES", str(60 * 24)) or str(60 * 24)
    )


    # 👑 Super Admin (used only once on startup)
    SUPERADMIN_EMAIL: str = _get(
        "SUPERADMIN_EMAIL", "admin@geotech.com"
    )
    SUPERADMIN_PASSWORD: str = _get(
        "SUPERADMIN_PASSWORD", "Admin@123"
    )
    SUPERADMIN_NAME: str = _get(
        "SUPERADMIN_NAME", "superadmin"
    )
    

       # ✉️ Email Configuration
    MAIL_HOST: str = _get("MAIL_HOST", "smtp.gmail.com")
    MAIL_PORT: int = int(_get("MAIL_PORT", "587") or "587")
    MAIL_USERNAME: str = _get("MAIL_USERNAME", "")
    MAIL_PASSWORD: str = _get("MAIL_PASSWORD", "")
    MAIL_FROM: str = _get("MAIL_FROM", "GeoTech <noreply@geotech.com>")

    # 🔗 Frontend
    FRONTEND_URL: str = _get("FRONTEND_URL", "http://localhost:5173")

    # 🌐 Extra browser origins allowed by CORS (comma-separated, optional).
    # The deployed server IP is covered automatically via FRONTEND_URL.
    CORS_EXTRA_ORIGINS: str = _get("CORS_EXTRA_ORIGINS", "")

    # 🏢 Organization display name used in invitation emails
    ORGANIZATION_NAME: str = _get("ORGANIZATION_NAME", "GeoTech")

    def require_production_secret(self) -> None:
        """Raise if running in production with the insecure default secret."""
        if self.ENV == "production" and (
            not self.SECRET_KEY or self.SECRET_KEY == "supersecretkey" or len(self.SECRET_KEY) < 32
        ):
            raise RuntimeError(
                "SECRET_KEY must be set to a strong value (>=32 chars) in production"
            )



settings = Settings()
