from sqlalchemy.orm import Session
from sqlalchemy import func
from app.modules.projects.models import (
    Project,
    ProjectSupervisor,
    ProjectVendor   # ✅ ADD THIS
)
from app.modules.users.models import User
from app.modules.vendors.models import Vendor
from app.modules.machinery.models import Machine
from app.modules.daily_execution.models import DailyExecutionReport 


def get_dashboard_summary(db: Session):

    # ================= PROJECTS =================
    total_projects = db.query(func.count(Project.id)).scalar()

    ongoing_projects = db.query(func.count(Project.id))\
        .filter(Project.status == "ongoing")\
        .scalar()

    hold_projects = db.query(func.count(Project.id))\
        .filter(Project.status == "onhold")\
        .scalar()

    completed_projects = db.query(func.count(Project.id))\
        .filter(Project.status == "completed")\
        .scalar()

    not_started_projects = db.query(func.count(Project.id))\
        .filter(Project.status == "Not Started")\
        .scalar()

    # ================= SUPERVISORS =================
    total_supervisors = db.query(func.count(User.id))\
        .filter(User.role == "SUPERVISOR")\
        .scalar()

    assigned_supervisors = db.query(func.count(func.distinct(ProjectSupervisor.supervisor_id)))\
        .scalar()

    idle_supervisors = max(total_supervisors - assigned_supervisors, 0)

    # ================= VENDORS =================
    # ================= VENDORS =================
    total_vendors = db.query(func.count(Vendor.id)).scalar()

    # Vendors assigned to at least one project
    active_vendors = (
        db.query(func.count(func.distinct(ProjectVendor.vendor_id)))
        .scalar()
    )

    inactive_vendors = max(total_vendors - active_vendors, 0)

    # ================= MACHINERY =================
    total_machinery = db.query(func.count(Machine.id)).scalar()

    working_machinery = db.query(func.count(Machine.id))\
        .filter(Machine.status == "working")\
        .scalar()

    maintenance_machinery = db.query(func.count(Machine.id))\
        .filter(Machine.status == "maintenance")\
        .scalar()

    active_machinery = db.query(func.count(Machine.id))\
        .filter(Machine.status == "active")\
        .scalar()

    idle_machinery = max(
        total_machinery - working_machinery - maintenance_machinery,
        0
    )

    # ================= REPORTS =================
    total_reports = db.query(func.count(DailyExecutionReport.id)).scalar()

    today_reports = db.query(func.count(DailyExecutionReport.id))\
        .filter(DailyExecutionReport.report_date == func.current_date())\
        .scalar()

    # ================= RESPONSE =================
    return {
        "projects": {
            "total": total_projects,
            "ongoing": ongoing_projects,
            "hold": hold_projects,
            "completed": completed_projects,
            "not_started": not_started_projects
        },
        "supervisors": {
            "total": total_supervisors,
            "assigned": assigned_supervisors,
            "idle": idle_supervisors
        },
        "vendors": {
            "total": total_vendors,
            "active": active_vendors,
            "inactive": inactive_vendors
        },
        "machinery": {
            "total": total_machinery,
            "working": working_machinery,
            "maintenance": maintenance_machinery,
            "active": active_machinery,
            "idle": idle_machinery
        },
        "reports": {
            "total": total_reports,
            "today": today_reports
        }
    }