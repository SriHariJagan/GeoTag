from sqlalchemy.orm import Session
from datetime import date
from sqlalchemy import or_

from app.modules.users.models import User
from app.modules.projects.models import ProjectSupervisor, Project
from app.modules.daily_execution.models import DailyExecutionReport
from app.modules.supervisors.schemas import AssignedProject

def get_supervisors_admin_view(db: Session, q: str | None = None,
                                page: int = 1, limit: int = 20) -> tuple[list, int]:
    from app.utils.pagination import paginate_query
    # Eligible pool: role SUPERVISOR (any case) — eligibility computed per user.
    # Account status shown; assignment requires ACTIVE (see users.service).
    query = db.query(User).filter(
        or_(User.role == "SUPERVISOR", User.role == "supervisor")
    )
    if (q or "").strip():
        like = f"%{q.strip()}%"
        query = query.filter(
            or_(User.full_name.ilike(like), User.email.ilike(like)))
    supervisors, total = paginate_query(query.order_by(User.id.desc()), page, limit)
    today = date.today()
    response = []

    for supervisor in supervisors:
        # Get active and historical projects
        assignments = (
            db.query(ProjectSupervisor)
            .filter(ProjectSupervisor.supervisor_id == supervisor.id)
            .all()
        )

        assigned_projects = []
        total_working_days = 0

        for assignment in assignments:
            project = db.query(Project).filter(Project.id == assignment.project_id).first()
            if not project:
                continue

            # Calculate working days (excluding leaves)
            reports = (
                db.query(DailyExecutionReport)
                .filter(
                    DailyExecutionReport.project_id == project.id,
                    DailyExecutionReport.created_by == supervisor.id
                )
                .all()
            )
            working_days = len(reports)

            total_working_days += working_days

            assigned_projects.append(
                AssignedProject(
                    id=project.id,
                    name=project.name,
                    location=project.location,
                    status=project.status,
                    assigned_at=assignment.assigned_at,
                    is_active=assignment.is_active,
                    working_days=working_days
                )
            )

        # Latest report created by this supervisor
        last_report = (
            db.query(DailyExecutionReport)
            .filter(DailyExecutionReport.created_by == supervisor.id)
            .order_by(DailyExecutionReport.report_date.desc())
            .first()
        )

        updated_today = last_report.report_date == today if last_report else False
        last_updated = last_report.report_date if last_report else None

        response.append({
            "id": supervisor.id,
            "name": supervisor.full_name,
            "email": supervisor.email,
            "contact": supervisor.contact or supervisor.primary_phone,
            "is_active": supervisor.is_active,
            "account_status": getattr(supervisor, "account_status", "ACTIVE" if supervisor.is_active else "INVITED"),
            "role": supervisor.role,
            "updated_today": updated_today,
            "last_updated": last_updated,
            "total_projects": len(assignments),
            "assigned_projects": assigned_projects,
            "total_working_days": total_working_days
        })

    return response, total