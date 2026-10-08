"""Company settings router."""
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.utils.dependencies import get_current_user
from app.modules.company import schemas, service

router = APIRouter(prefix="/company-settings", tags=["Company"])


@router.get("", response_model=schemas.CompanySettingsResponse)
def get_company(db: Session = Depends(get_db),
                current_user=Depends(get_current_user)):
    return service.serialize(service.get_settings(db))


@router.put("", response_model=schemas.CompanySettingsResponse)
def update_company(data: schemas.CompanySettingsUpdate,
                   db: Session = Depends(get_db),
                   current_user=Depends(get_current_user)):
    return service.update_settings(db, data, current_user)


@router.post("/logo", response_model=schemas.CompanySettingsResponse)
def upload_logo(file: UploadFile = File(...), db: Session = Depends(get_db),
                current_user=Depends(get_current_user)):
    return service.upload_logo(db, file, current_user)


@router.get("/logo")
def get_logo(db: Session = Depends(get_db),
             current_user=Depends(get_current_user)):
    p = service.logo_abs_path(db)
    if not p:
        raise HTTPException(status_code=404, detail="No logo configured")
    return FileResponse(p)
