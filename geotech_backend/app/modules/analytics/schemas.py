from datetime import date
from typing import Optional

from pydantic import BaseModel


class RiskReason(BaseModel):
    code: str
    message: str


class DelayRiskResponse(BaseModel):
    project_id: int
    risk: str
    score: int
    expected_completion_date: Optional[date]
    reasons: list[RiskReason]
    metrics: dict


class CostRiskResponse(BaseModel):
    project_id: int
    projected_total_cost: float
    cost_overrun_probability: float
    risk: str
    abnormal_cost_categories: list[str]
    reasons: list[RiskReason]
    metrics: dict


class DashboardInsight(BaseModel):
    type: str
    severity: str
    message: str
    project_id: Optional[int] = None


class DashboardInsightsResponse(BaseModel):
    delay_risk_projects: int
    cost_risk_projects: int
    stale_report_projects: int
    insights: list[DashboardInsight]
