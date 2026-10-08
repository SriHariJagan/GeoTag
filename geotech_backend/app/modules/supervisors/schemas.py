from pydantic import BaseModel
from datetime import date
from typing import List, Optional

class AssignedProject(BaseModel):
    id: int
    name: str
    location: Optional[str]
    status: Optional[str]
    assigned_at: Optional[date]
    is_active: bool
    working_days: int = 0

    class Config:
        from_attributes = True


class SupervisorAdminView(BaseModel):
    id: int
    name: str
    email: str
    contact: Optional[str]
    is_active: bool
    account_status: Optional[str] = None
    role: Optional[str] = None

    updated_today: bool
    last_updated: Optional[date]

    total_projects: int
    assigned_projects: List[AssignedProject]

    total_working_days: int

    class Config:
        from_attributes = True