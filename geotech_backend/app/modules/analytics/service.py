from collections import defaultdict
from datetime import date, timedelta
from functools import lru_cache
from math import ceil
from pathlib import Path

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.modules.Expenditure.models import Expenditure, ManpowerExpense, VendorExpense
from app.modules.daily_execution.models import DailyExecutionReport
from app.modules.machinery.models import Machine
from app.modules.projects.models import Project, ProjectMachine, ProjectSupervisor
from app.modules.users.models import User
from app.modules.vendors.models import Vendor

try:
    import joblib
    import pandas as pd
except ImportError:
    joblib = None
    pd = None


MODEL_DIR = Path(__file__).resolve().parents[4] / "ml_data" / "models"
FEATURES = [
    "planned_duration_days",
    "total_boreholes",
    "completed_boreholes",
    "estimated_total_depth",
    "target_depth_per_day",
    "total_depth_done",
    "avg_depth_per_day",
    "reporting_days",
    "report_gap_count",
    "active_supervisor_count",
    "vendor_count",
    "machine_count",
    "project_budget",
    "total_spend",
    "spend_per_meter",
    "travel_total",
    "accommodation_total",
    "vehicle_hire_total",
    "sample_transport_total",
    "vendor_cost_total",
    "manpower_cost_total",
]


def _risk_from_score(score: int) -> str:
    if score >= 70:
        return "high"
    if score >= 40:
        return "medium"
    return "low"


def _reason(code: str, message: str) -> dict:
    return {"code": code, "message": message}


def _safe_div(numerator: float, denominator: float) -> float:
    if not denominator:
        return 0
    return numerator / denominator


@lru_cache(maxsize=8)
def _load_model(name: str):
    if not joblib:
        return None
    path = MODEL_DIR / f"{name}.pkl"
    if not path.exists():
        return None
    return joblib.load(path)


def _predict_with_models(feature_row: dict) -> dict | None:
    if pd is None:
        return None

    models = {
        "delay_classifier": _load_model("delay_classifier"),
        "delay_days_forecaster": _load_model("delay_days_forecaster"),
        "cost_overrun_classifier": _load_model("cost_overrun_classifier"),
        "projected_cost_forecaster": _load_model("projected_cost_forecaster"),
        "overrun_percent_forecaster": _load_model("overrun_percent_forecaster"),
    }
    if any(model is None for model in models.values()):
        return None

    frame = pd.DataFrame([{feature: feature_row.get(feature, 0) for feature in FEATURES}])
    delay_probability = float(models["delay_classifier"].predict_proba(frame)[0][1])
    forecast_delay_days = max(float(models["delay_days_forecaster"].predict(frame)[0]), 0)
    cost_overrun_probability = float(models["cost_overrun_classifier"].predict_proba(frame)[0][1])
    projected_total_cost = max(float(models["projected_cost_forecaster"].predict(frame)[0]), 0)
    overrun_percent = float(models["overrun_percent_forecaster"].predict(frame)[0])

    return {
        "delay_probability": delay_probability,
        "forecast_delay_days": forecast_delay_days,
        "cost_overrun_probability": cost_overrun_probability,
        "projected_total_cost": projected_total_cost,
        "overrun_percent": overrun_percent,
    }


def _project_start(project: Project, reports: list[DailyExecutionReport]) -> date:
    if project.actual_start_date:
        return project.actual_start_date
    if project.planned_start_date:
        return project.planned_start_date
    report_dates = [report.report_date for report in reports if report.report_date]
    if report_dates:
        return min(report_dates)
    return date.today()


def _planned_duration(project: Project) -> int:
    if project.planned_start_date and project.planned_end_date:
        return max((project.planned_end_date - project.planned_start_date).days + 1, 1)
    return 0


def _expected_completion_from_rate(
    remaining_units: float,
    units_per_day: float,
) -> date | None:
    if remaining_units <= 0:
        return date.today()
    if units_per_day <= 0:
        return None
    return date.today() + timedelta(days=ceil(remaining_units / units_per_day))


def get_delay_risk(db: Session, project_id: int) -> dict | None:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        return None

    reports = (
        db.query(DailyExecutionReport)
        .filter(DailyExecutionReport.project_id == project_id)
        .all()
    )
    today = date.today()
    start_date = _project_start(project, reports)
    elapsed_days = max((today - start_date).days + 1, 1)
    working_days = len({report.report_date for report in reports if report.report_date})

    total_depth_done = sum(report.total_depth or 0 for report in reports)
    avg_depth_per_working_day = _safe_div(total_depth_done, working_days)

    total_boreholes = project.total_boreholes or 0
    completed_boreholes = project.completed_boreholes or 0
    progress_percent = project.progress or (
        _safe_div(completed_boreholes, total_boreholes) * 100
    )

    reasons = []
    score = 0

    planned_duration = None
    expected_progress_percent = None
    if project.planned_start_date and project.planned_end_date:
        planned_duration = max(
            (project.planned_end_date - project.planned_start_date).days + 1,
            1,
        )
        expected_progress_percent = min(
            _safe_div(elapsed_days, planned_duration) * 100,
            100,
        )
        if progress_percent + 10 < expected_progress_percent:
            score += 35
            reasons.append(
                _reason(
                    "progress_behind_plan",
                    f"Progress is {progress_percent:.1f}% but expected progress is {expected_progress_percent:.1f}%.",
                )
            )
    else:
        score += 10
        reasons.append(
            _reason(
                "missing_plan_dates",
                "Project has no planned start/end dates, so delay prediction confidence is lower.",
            )
        )

    if reports:
        latest_report_date = max(report.report_date for report in reports)
        report_gap_days = (today - latest_report_date).days
    else:
        latest_report_date = None
        report_gap_days = elapsed_days

    if report_gap_days >= 3:
        score += 25
        reasons.append(
            _reason(
                "reporting_gap",
                f"No daily execution report has been submitted for {report_gap_days} days.",
            )
        )
    elif report_gap_days >= 1:
        score += 10
        reasons.append(
            _reason(
                "minor_reporting_gap",
                f"Latest daily execution report is {report_gap_days} day(s) old.",
            )
        )

    if project.target_depth_per_day and avg_depth_per_working_day:
        if avg_depth_per_working_day < project.target_depth_per_day * 0.8:
            score += 25
            reasons.append(
                _reason(
                    "slow_depth_rate",
                    f"Average depth/day is {avg_depth_per_working_day:.1f}, below target {project.target_depth_per_day:.1f}.",
                )
            )

    assigned_supervisors = (
        db.query(func.count(ProjectSupervisor.id))
        .filter(
            ProjectSupervisor.project_id == project_id,
            ProjectSupervisor.is_active == True,
        )
        .scalar()
        or 0
    )
    if assigned_supervisors == 0:
        score += 20
        reasons.append(
            _reason("no_active_supervisor", "Project has no active supervisor assigned.")
        )

    working_machine_count = (
        db.query(func.count(Machine.id))
        .join(ProjectMachine, ProjectMachine.machine_id == Machine.id)
        .filter(ProjectMachine.project_id == project_id, Machine.status == "working")
        .scalar()
        or 0
    )
    if working_machine_count == 0:
        score += 20
        reasons.append(
            _reason("no_working_machine", "Project has no machinery marked as working.")
        )

    completed_remaining = max(total_boreholes - completed_boreholes, 0)
    boreholes_per_day = _safe_div(completed_boreholes, elapsed_days)
    completion_by_boreholes = _expected_completion_from_rate(
        completed_remaining,
        boreholes_per_day or project.target_boreholes_per_day or 0,
    )

    remaining_depth = max((project.estimated_total_depth or 0) - total_depth_done, 0)
    completion_by_depth = _expected_completion_from_rate(
        remaining_depth,
        avg_depth_per_working_day or project.target_depth_per_day or 0,
    )

    candidates = [
        value for value in [completion_by_boreholes, completion_by_depth] if value
    ]
    expected_completion = max(candidates) if candidates else project.planned_end_date

    if project.planned_end_date and expected_completion and expected_completion > project.planned_end_date:
        delay_days = (expected_completion - project.planned_end_date).days
        score += min(30, 10 + delay_days)
        reasons.append(
            _reason(
                "forecast_late",
                f"Expected completion is {delay_days} day(s) after planned end date.",
            )
        )

    if not reasons:
        reasons.append(_reason("on_track", "Current progress and reporting look on track."))

    model_output = _predict_with_models(_project_feature_row(db, project, reports=reports))
    if model_output:
        delay_probability = model_output["delay_probability"]
        forecast_delay_days = model_output["forecast_delay_days"]
        score = round(delay_probability * 100)
        if project.planned_end_date:
            expected_completion = project.planned_end_date + timedelta(
                days=ceil(forecast_delay_days)
            )
        elif expected_completion:
            expected_completion = expected_completion + timedelta(
                days=ceil(forecast_delay_days)
            )
        reasons.insert(
            0,
            _reason(
                "model_forecast",
                f"Forecast model predicts {delay_probability * 100:.1f}% delay probability and {forecast_delay_days:.1f} delay day(s).",
            ),
        )

    score = min(score, 100)
    return {
        "project_id": project.id,
        "risk": _risk_from_score(score),
        "score": score,
        "expected_completion_date": expected_completion,
        "reasons": reasons,
        "metrics": {
            "elapsed_days": elapsed_days,
            "working_days": working_days,
            "progress_percent": round(progress_percent, 2),
            "expected_progress_percent": round(expected_progress_percent or 0, 2),
            "avg_depth_per_working_day": round(avg_depth_per_working_day, 2),
            "report_gap_days": report_gap_days,
            "assigned_supervisors": assigned_supervisors,
            "working_machine_count": working_machine_count,
            "total_depth_done": round(total_depth_done, 2),
            "model_used": bool(model_output),
            "delay_probability": round(model_output["delay_probability"], 4)
            if model_output
            else None,
            "forecast_delay_days": round(model_output["forecast_delay_days"], 2)
            if model_output
            else None,
        },
    }


def _cost_totals(expenditures: list[Expenditure]) -> dict[str, float]:
    totals = defaultdict(float)
    for exp in expenditures:
        for item in exp.manpower_expenses:
            totals["travel"] += item.travel or 0
            totals["accommodation"] += item.accom or 0
            totals["da"] += item.da or 0
            totals["vehicle_hire"] += item.vehicle_hire or 0
            totals["jcb_hydra_other"] += item.jcb_hydra_other or 0
            totals["tractor_trolly_water"] += item.tractor_trolly_water or 0
            totals["local_vehicle_hire"] += item.local_vehicle_hire or 0
            totals["sample_transport"] += item.sample_transport or 0
            totals["misc"] += item.misc or 0
            totals["manpower_cost"] += item.total or 0
        for item in exp.vendor_expenses:
            totals["vendor_cost"] += item.total_exp or 0
            totals["vendor_base_cost"] += item.vendor_total_exp or 0
            totals["accommodation"] += item.accom or 0
            totals["vehicle_hire"] += item.vehicle_hire or 0
            totals["jcb_hydra_other"] += item.jcb_hydra_other or 0
            totals["tractor_trolly_water"] += item.tractor_trolly_water or 0
            totals["local_vehicle_hire"] += item.local_vehicle_hire or 0
            totals["sample_transport"] += item.sample_transport or 0
            totals["misc"] += item.misc or 0
        totals["grand_total"] += exp.grand_total or 0
    return dict(totals)


def _project_feature_row(
    db: Session,
    project: Project,
    reports: list[DailyExecutionReport] | None = None,
    expenditures: list[Expenditure] | None = None,
) -> dict:
    reports = reports if reports is not None else (
        db.query(DailyExecutionReport)
        .filter(DailyExecutionReport.project_id == project.id)
        .all()
    )
    expenditures = expenditures if expenditures is not None else (
        db.query(Expenditure)
        .filter(Expenditure.project_id == project.id)
        .all()
    )

    totals = _cost_totals(expenditures)
    total_depth_done = sum(report.total_depth or 0 for report in reports)
    reporting_days = len({report.report_date for report in reports if report.report_date})
    start_date = _project_start(project, reports)
    if reports:
        all_dates = sorted({report.report_date for report in reports if report.report_date})
        report_gap_count = sum(
            max((all_dates[index] - all_dates[index - 1]).days - 1, 0)
            for index in range(1, len(all_dates))
        )
    else:
        report_gap_count = max((date.today() - start_date).days, 0)

    active_supervisor_count = (
        db.query(func.count(ProjectSupervisor.id))
        .filter(ProjectSupervisor.project_id == project.id, ProjectSupervisor.is_active == True)
        .scalar()
        or 0
    )
    vendor_count = len(project.vendors or [])
    machine_count = len(project.machinery or [])
    total_spend = totals.get("grand_total", 0)
    estimated_total_depth = project.estimated_total_depth or total_depth_done or 1

    return {
        "planned_duration_days": _planned_duration(project),
        "total_boreholes": project.total_boreholes or 0,
        "completed_boreholes": project.completed_boreholes or 0,
        "estimated_total_depth": estimated_total_depth,
        "target_depth_per_day": project.target_depth_per_day or 0,
        "total_depth_done": total_depth_done,
        "avg_depth_per_day": _safe_div(total_depth_done, reporting_days),
        "reporting_days": reporting_days,
        "report_gap_count": report_gap_count,
        "active_supervisor_count": active_supervisor_count,
        "vendor_count": vendor_count,
        "machine_count": machine_count,
        "project_budget": project.project_budget or 0,
        "total_spend": total_spend,
        "spend_per_meter": _safe_div(total_spend, estimated_total_depth),
        "travel_total": totals.get("travel", 0),
        "accommodation_total": totals.get("accommodation", 0),
        "vehicle_hire_total": totals.get("vehicle_hire", 0),
        "sample_transport_total": totals.get("sample_transport", 0),
        "vendor_cost_total": totals.get("vendor_cost", 0),
        "manpower_cost_total": totals.get("manpower_cost", 0),
    }


def get_cost_risk(db: Session, project_id: int) -> dict | None:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        return None

    expenditures = (
        db.query(Expenditure)
        .filter(Expenditure.project_id == project_id)
        .all()
    )
    totals = _cost_totals(expenditures)
    spent = totals.get("grand_total", 0)

    progress_percent = project.progress or (
        _safe_div(project.completed_boreholes or 0, project.total_boreholes or 0) * 100
    )
    progress_fraction = max(progress_percent / 100, 0.01)
    projected_total_cost = spent / progress_fraction if spent else 0
    budget = project.project_budget or 0

    reasons = []
    score = 0
    overrun_probability = 0.0

    if budget > 0:
        budget_used_percent = _safe_div(spent, budget) * 100
        projected_overrun_percent = _safe_div(projected_total_cost - budget, budget) * 100
        if budget_used_percent > progress_percent + 15:
            score += 35
            reasons.append(
                _reason(
                    "budget_ahead_of_progress",
                    f"Budget used is {budget_used_percent:.1f}% while progress is {progress_percent:.1f}%.",
                )
            )
        if projected_total_cost > budget:
            score += min(35, int(max(projected_overrun_percent, 0)))
            reasons.append(
                _reason(
                    "projected_overrun",
                    f"Projected total cost is {projected_overrun_percent:.1f}% above budget.",
                )
            )
        overrun_probability = min(max(score / 100, 0), 0.95)
    else:
        score += 20
        overrun_probability = 0.25 if spent else 0.0
        reasons.append(
            _reason(
                "missing_budget",
                "Project budget is missing, so this is a spend-risk estimate rather than true overrun prediction.",
            )
        )

    abnormal_categories = []
    comparable_categories = {
        key: value
        for key, value in totals.items()
        if key not in {"grand_total"} and value > 0
    }
    for category, value in comparable_categories.items():
        if spent and value / spent >= 0.35:
            abnormal_categories.append(category)

    if abnormal_categories:
        score += min(20, len(abnormal_categories) * 8)
        reasons.append(
            _reason(
                "abnormal_categories",
                "One or more cost categories take an unusually large share of total spend.",
            )
        )

    if not reasons:
        reasons.append(_reason("cost_on_track", "Current spend appears aligned with progress."))

    model_output = _predict_with_models(
        _project_feature_row(db, project, expenditures=expenditures)
    )
    if model_output:
        overrun_probability = round(model_output["cost_overrun_probability"], 2)
        projected_total_cost = model_output["projected_total_cost"]
        score = round(overrun_probability * 100)
        reasons.insert(
            0,
            _reason(
                "model_forecast",
                f"Forecast model predicts {overrun_probability * 100:.1f}% cost overrun probability.",
            ),
        )

    score = min(score, 100)
    overrun_probability = round(min(max(overrun_probability, score / 100), 0.99), 2)

    return {
        "project_id": project.id,
        "projected_total_cost": round(projected_total_cost, 2),
        "cost_overrun_probability": overrun_probability,
        "risk": _risk_from_score(score),
        "abnormal_cost_categories": abnormal_categories,
        "reasons": reasons,
        "metrics": {
            "spent": round(spent, 2),
            "budget": round(budget, 2),
            "progress_percent": round(progress_percent, 2),
            "category_totals": {k: round(v, 2) for k, v in totals.items()},
            "model_used": bool(model_output),
            "forecast_overrun_percent": round(model_output["overrun_percent"], 4)
            if model_output
            else None,
        },
    }


def get_dashboard_insights(db: Session) -> dict:
    projects = db.query(Project).all()
    insights = []
    delay_risk_projects = 0
    cost_risk_projects = 0
    stale_report_projects = 0

    for project in projects:
        delay = get_delay_risk(db, project.id)
        if delay and delay["risk"] == "high":
            delay_risk_projects += 1
            insights.append(
                {
                    "type": "delay_risk",
                    "severity": "high",
                    "message": f"{project.name} is at high delay risk.",
                    "project_id": project.id,
                }
            )

        cost = get_cost_risk(db, project.id)
        if cost and cost["risk"] == "high":
            cost_risk_projects += 1
            insights.append(
                {
                    "type": "cost_risk",
                    "severity": "high",
                    "message": f"{project.name} is at high cost overrun risk.",
                    "project_id": project.id,
                }
            )

        report_gap = delay["metrics"]["report_gap_days"] if delay else 0
        if report_gap >= 2:
            stale_report_projects += 1
            insights.append(
                {
                    "type": "reporting_gap",
                    "severity": "medium",
                    "message": f"{project.name} has no report for {report_gap} days.",
                    "project_id": project.id,
                }
            )

    vendor_totals = (
        db.query(
            Vendor.id,
            Vendor.vendor_company,
            Vendor.contact_person,
            func.sum(VendorExpense.total_exp),
        )
        .join(VendorExpense, VendorExpense.vendor_id == Vendor.id)
        .group_by(Vendor.id)
        .all()
    )
    if vendor_totals:
        values = [row[3] or 0 for row in vendor_totals]
        avg_vendor_cost = _safe_div(sum(values), len(values))
        for vendor_id, vendor_company, contact_person, vendor_cost in vendor_totals:
            vendor_cost = vendor_cost or 0
            if avg_vendor_cost and vendor_cost > avg_vendor_cost * 1.28:
                name = vendor_company or contact_person or f"Vendor {vendor_id}"
                diff = ((vendor_cost - avg_vendor_cost) / avg_vendor_cost) * 100
                insights.append(
                    {
                        "type": "vendor_cost",
                        "severity": "medium",
                        "message": f"{name} has {diff:.0f}% higher cost than vendor average.",
                        "project_id": None,
                    }
                )
                break

    total_machines = db.query(func.count(Machine.id)).scalar() or 0
    working_machines = (
        db.query(func.count(Machine.id))
        .filter(Machine.status == "working")
        .scalar()
        or 0
    )
    utilization = _safe_div(working_machines, total_machines)
    if total_machines and utilization < 0.4:
        insights.append(
            {
                "type": "machinery_utilization",
                "severity": "medium",
                "message": f"Machinery utilization is low at {utilization * 100:.0f}%.",
                "project_id": None,
            }
        )

    supervisor_rows = (
        db.query(
            User.id,
            User.full_name,
            func.count(func.distinct(DailyExecutionReport.report_date)),
        )
        .join(DailyExecutionReport, DailyExecutionReport.created_by == User.id)
        .filter(User.role == "SUPERVISOR")
        .group_by(User.id)
        .order_by(func.count(func.distinct(DailyExecutionReport.report_date)).desc())
        .all()
    )
    if supervisor_rows:
        _, full_name, report_days = supervisor_rows[0]
        insights.append(
            {
                "type": "supervisor_consistency",
                "severity": "low",
                "message": f"{full_name} has the highest report consistency with {report_days} reporting day(s).",
                "project_id": None,
            }
        )

    return {
        "delay_risk_projects": delay_risk_projects,
        "cost_risk_projects": cost_risk_projects,
        "stale_report_projects": stale_report_projects,
        "insights": insights[:10],
    }
