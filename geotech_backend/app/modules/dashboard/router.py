from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.modules.dashboard import service
from app.utils.dependencies import require_roles

router = APIRouter(
    prefix="/dashboard",
    tags=["Dashboard"]
)

@router.get("/", dependencies=[Depends(require_roles("SUPERADMIN", "ADMIN", "MONITOR"))])
def get_dashboard(db: Session = Depends(get_db)):
    return service.get_dashboard_summary(db)
