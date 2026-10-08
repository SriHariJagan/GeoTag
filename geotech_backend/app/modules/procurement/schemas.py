"""Procurement schemas — server computes all money totals."""
from pydantic import BaseModel, ConfigDict, field_validator, model_validator
from typing import Optional, List
from datetime import datetime, date

from app.core.rbac import VALID_RFQ_STATUSES


# ---------- RFQ ----------

class RFQItemCreate(BaseModel):
    description: str
    category: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    technical_specification: Optional[str] = None
    estimated_rate: Optional[float] = None


class RFQItemResponse(RFQItemCreate):
    id: int
    rfq_id: int
    model_config = ConfigDict(from_attributes=True)


class RFQCreate(BaseModel):
    project_id: int
    title: str
    description: Optional[str] = None
    scope_of_work: Optional[str] = None
    technical_requirements: Optional[str] = None
    submission_deadline: Optional[datetime] = None
    expected_start_date: Optional[date] = None
    expected_completion_date: Optional[date] = None
    currency: str = "INR"
    commercial_terms: Optional[str] = None
    technical_terms: Optional[str] = None
    items: List[RFQItemCreate] = []


class RFQUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    scope_of_work: Optional[str] = None
    technical_requirements: Optional[str] = None
    submission_deadline: Optional[datetime] = None
    expected_start_date: Optional[date] = None
    expected_completion_date: Optional[date] = None
    currency: Optional[str] = None
    commercial_terms: Optional[str] = None
    technical_terms: Optional[str] = None


class RFQResponse(BaseModel):
    id: int
    rfq_number: str
    project_id: int
    title: str
    description: Optional[str] = None
    scope_of_work: Optional[str] = None
    technical_requirements: Optional[str] = None
    submission_deadline: Optional[datetime] = None
    expected_start_date: Optional[date] = None
    expected_completion_date: Optional[date] = None
    currency: str = "INR"
    commercial_terms: Optional[str] = None
    technical_terms: Optional[str] = None
    status: str
    created_by: Optional[int] = None
    created_at: Optional[datetime] = None
    items: List[RFQItemResponse] = []
    invited_vendors: List[int] = []
    quotation_count: int = 0
    model_config = ConfigDict(from_attributes=True)


class RFQSend(BaseModel):
    vendor_ids: List[int]


class RFQVendorResponse(BaseModel):
    id: int
    rfq_id: int
    vendor_id: int
    vendor_name: Optional[str] = None
    status: str
    sent_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)


# ---------- Quotation ----------

class QuotationItemCreate(BaseModel):
    rfq_item_id: Optional[int] = None
    description: Optional[str] = None
    unit: Optional[str] = None
    quantity: float = 1
    unit_rate: float = 0
    tax: float = 0.0
    discount: float = 0.0
    remarks: Optional[str] = None

    @field_validator("quantity")
    @classmethod
    def qty_non_negative(cls, v):
        if v < 0:
            raise ValueError("quantity cannot be negative")
        return v

    @field_validator("unit_rate", "tax", "discount")
    @classmethod
    def money_non_negative(cls, v):
        if v < 0:
            raise ValueError("monetary values cannot be negative")
        return v


class QuotationItemResponse(QuotationItemCreate):
    id: int
    quotation_id: int
    line_total: float = 0.0
    model_config = ConfigDict(from_attributes=True)


class QuotationCreate(BaseModel):
    rfq_id: int
    vendor_id: int
    valid_until: Optional[date] = None
    currency: str = "INR"
    mobilization_cost: float = 0.0
    delivery_cost: float = 0.0
    payment_terms: Optional[str] = None
    lead_time_days: Optional[int] = None
    assumptions: Optional[str] = None
    exclusions: Optional[str] = None
    remarks: Optional[str] = None
    items: List[QuotationItemCreate] = []


class QuotationResponse(BaseModel):
    id: int
    quotation_number: str
    rfq_id: int
    vendor_id: int
    vendor_name: Optional[str] = None
    submitted_by: Optional[int] = None
    valid_until: Optional[date] = None
    currency: str = "INR"
    subtotal: float = 0.0
    tax: float = 0.0
    discount: float = 0.0
    total: float = 0.0
    mobilization_cost: float = 0.0
    delivery_cost: float = 0.0
    payment_terms: Optional[str] = None
    lead_time_days: Optional[int] = None
    assumptions: Optional[str] = None
    exclusions: Optional[str] = None
    remarks: Optional[str] = None
    status: str
    submitted_at: Optional[datetime] = None
    items: List[QuotationItemResponse] = []
    evaluation: Optional["EvaluationResponse"] = None
    model_config = ConfigDict(from_attributes=True)


class QuotationDocumentCreate(BaseModel):
    document_type: str
    file_name: Optional[str] = None
    mime_type: Optional[str] = None
    file_size: Optional[int] = None


class QuotationDocumentResponse(QuotationDocumentCreate):
    id: int
    quotation_id: int
    storage_status: str = "PENDING"
    model_config = ConfigDict(from_attributes=True)


# ---------- Evaluation ----------

class EvaluationCreate(BaseModel):
    technical_score: Optional[float] = None
    commercial_score: Optional[float] = None
    experience_score: Optional[float] = None
    capacity_score: Optional[float] = None
    compliance_score: Optional[float] = None
    evaluation_notes: Optional[str] = None

    @model_validator(mode="after")
    def scores_range(self):
        for f in ("technical_score", "commercial_score", "experience_score",
                  "capacity_score", "compliance_score"):
            v = getattr(self, f)
            if v is not None and (v < 0 or v > 100):
                raise ValueError(f"{f} must be between 0 and 100")
        provided = [getattr(self, f) for f in (
            "technical_score", "commercial_score", "experience_score",
            "capacity_score", "compliance_score") if getattr(self, f) is not None]
        if not provided:
            raise ValueError("At least one score is required")
        return self


class EvaluationResponse(EvaluationCreate):
    id: int
    quotation_id: int
    overall_score: Optional[float] = None
    evaluated_by: Optional[int] = None
    evaluated_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)


QuotationResponse.model_rebuild()


# ---------- Award ----------

class AwardCreate(BaseModel):
    quotation_id: int
    award_reason: Optional[str] = None
    internal_notes: Optional[str] = None
    lowest_compliant: Optional[str] = None  # YES|NO|UNKNOWN

    @field_validator("lowest_compliant")
    @classmethod
    def lc_known(cls, v):
        if v is not None and v not in {"YES", "NO", "UNKNOWN"}:
            raise ValueError("lowest_compliant must be YES, NO or UNKNOWN")
        return v


class AwardResponse(BaseModel):
    id: int
    rfq_id: int
    quotation_id: int
    vendor_id: int
    vendor_name: Optional[str] = None
    selected_by: Optional[int] = None
    selected_at: Optional[datetime] = None
    award_reason: Optional[str] = None
    lowest_compliant: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


# ---------- Work order (wizard: header/scope/BOQ/commercial/vendors/terms) ----------

class WorkOrderItemCreate(BaseModel):
    item_number: Optional[str] = None
    description: str
    sub_description: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    unit_rate: Optional[float] = None
    line_total: Optional[float] = None  # ignored; server-computed


class WorkOrderItemResponse(WorkOrderItemCreate):
    id: int
    work_order_id: int
    line_total: Optional[float] = 0.0
    model_config = ConfigDict(from_attributes=True)


class WorkOrderCreate(BaseModel):
    project_id: int
    vendor_id: Optional[int] = None  # single-vendor WO; multi-vendor via send.vendor_ids
    work_order_number: Optional[str] = None  # auto if omitted; 409 on duplicate
    work_order_date: Optional[date] = None
    project_name: Optional[str] = None
    client_name: Optional[str] = None
    site: Optional[str] = None
    location: Optional[str] = None
    work_type: Optional[str] = None
    rfq_id: Optional[int] = None
    quotation_id: Optional[int] = None  # optional: direct WO allowed (no award needed)
    subject: Optional[str] = None
    reference: Optional[str] = None
    intro_text: Optional[str] = None
    acceptance_text: Optional[str] = None
    payment_terms_list: Optional[List[str]] = None
    general_terms: Optional[List[str]] = None
    vendor_override: Optional[dict] = None  # doc-specific vendor fields; master untouched
    team_supervisors: Optional[List[int]] = None  # user ids, eligibility enforced
    team_machines: Optional[List[dict]] = None  # [{machine_id, rate_per_day?}]
    signer_name: Optional[str] = None
    signer_designation: Optional[str] = None
    vendor_signer_name: Optional[str] = None
    vendor_signer_designation: Optional[str] = None
    scope_of_work: Optional[str] = None
    currency: str = "INR"
    discount: float = 0.0
    tax_amount: float = 0.0
    other_charges: float = 0.0
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    payment_terms: Optional[str] = None
    validity_days: Optional[int] = None
    completion_period: Optional[str] = None
    retention_percent: Optional[float] = None
    tax_terms: Optional[str] = None
    delivery_terms: Optional[str] = None
    special_conditions: Optional[str] = None
    standard_terms: Optional[str] = None
    custom_terms: Optional[str] = None
    items: List[WorkOrderItemCreate] = []

    @field_validator("discount", "tax_amount", "other_charges")
    @classmethod
    def money_non_negative(cls, v):
        if v is not None and v < 0:
            raise ValueError("monetary values cannot be negative")
        return v


class WorkOrderUpdate(BaseModel):
    project_name: Optional[str] = None
    client_name: Optional[str] = None
    site: Optional[str] = None
    location: Optional[str] = None
    work_type: Optional[str] = None
    subject: Optional[str] = None
    reference: Optional[str] = None
    intro_text: Optional[str] = None
    acceptance_text: Optional[str] = None
    payment_terms_list: Optional[List[str]] = None
    general_terms: Optional[List[str]] = None
    vendor_override: Optional[dict] = None
    team_supervisors: Optional[List[int]] = None
    team_machines: Optional[List[dict]] = None
    signer_name: Optional[str] = None
    signer_designation: Optional[str] = None
    vendor_signer_name: Optional[str] = None
    vendor_signer_designation: Optional[str] = None
    scope_of_work: Optional[str] = None
    currency: Optional[str] = None
    discount: Optional[float] = None
    tax_amount: Optional[float] = None
    other_charges: Optional[float] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    payment_terms: Optional[str] = None
    validity_days: Optional[int] = None
    completion_period: Optional[str] = None
    retention_percent: Optional[float] = None
    tax_terms: Optional[str] = None
    delivery_terms: Optional[str] = None
    special_conditions: Optional[str] = None
    standard_terms: Optional[str] = None
    custom_terms: Optional[str] = None
    items: Optional[List[WorkOrderItemCreate]] = None


class WorkOrderDocumentResponse(BaseModel):
    id: int
    work_order_id: int
    version: int
    document_type: str
    file_name: Optional[str] = None
    mime_type: Optional[str] = None
    file_size: Optional[int] = None
    sha256: Optional[str] = None
    uploaded_by: Optional[int] = None
    uploaded_at: Optional[datetime] = None
    is_final: int = 0
    is_signed: int = 0
    model_config = ConfigDict(from_attributes=True)


class DocumentVerifyResponse(BaseModel):
    document_id: int
    verified: bool
    stored_sha256: Optional[str] = None
    computed_sha256: Optional[str] = None


class WorkOrderResponse(BaseModel):
    id: int
    work_order_number: str
    parent_id: Optional[int] = None
    work_order_date: Optional[date] = None
    project_id: int
    vendor_id: Optional[int] = None
    vendor_name: Optional[str] = None
    rfq_id: Optional[int] = None
    quotation_id: Optional[int] = None
    project_name: Optional[str] = None
    client_name: Optional[str] = None
    site: Optional[str] = None
    location: Optional[str] = None
    work_type: Optional[str] = None
    subject: Optional[str] = None
    reference: Optional[str] = None
    intro_text: Optional[str] = None
    acceptance_text: Optional[str] = None
    payment_terms_list: List[str] = []
    general_terms: List[str] = []
    vendor_override: Optional[dict] = None
    team_supervisors: List[int] = []
    team_machines: List[dict] = []
    signer_name: Optional[str] = None
    signer_designation: Optional[str] = None
    vendor_signer_name: Optional[str] = None
    vendor_signer_designation: Optional[str] = None
    scope_of_work: Optional[str] = None
    subtotal: float = 0.0
    discount: float = 0.0
    tax_amount: float = 0.0
    other_charges: float = 0.0
    grand_total: float = 0.0
    contract_value: float = 0.0
    currency: str = "INR"
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    payment_terms: Optional[str] = None
    validity_days: Optional[int] = None
    completion_period: Optional[str] = None
    retention_percent: Optional[float] = None
    tax_terms: Optional[str] = None
    delivery_terms: Optional[str] = None
    special_conditions: Optional[str] = None
    standard_terms: Optional[str] = None
    custom_terms: Optional[str] = None
    status: str
    version: int = 1
    is_locked: int = 0
    issued_by: Optional[int] = None
    issued_at: Optional[datetime] = None
    accepted_at: Optional[datetime] = None
    rejected_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    signed_by: Optional[int] = None
    signed_at: Optional[datetime] = None
    stamped_by: Optional[int] = None
    stamped_at: Optional[datetime] = None
    finalized_by: Optional[int] = None
    finalized_at: Optional[datetime] = None
    pdf_path: Optional[str] = None
    pdf_version: int = 0
    vendor_snapshot: Optional[dict] = None
    project_snapshot: Optional[dict] = None
    company_snapshot: Optional[dict] = None
    items: List[WorkOrderItemResponse] = []
    documents: List[WorkOrderDocumentResponse] = []
    model_config = ConfigDict(from_attributes=True)


class WorkOrderSend(BaseModel):
    vendor_ids: List[int]


class WorkOrderVendorResponse(BaseModel):
    id: int
    work_order_id: int
    vendor_id: int
    vendor_name: Optional[str] = None
    status: str
    sent_at: Optional[datetime] = None
    viewed_at: Optional[datetime] = None
    accepted_at: Optional[datetime] = None
    rejected_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class WorkOrderVendorRespond(BaseModel):
    vendor_id: int
    accept: bool = True
    rejection_reason: Optional[str] = None


class WorkOrderSign(BaseModel):
    signature_data: Optional[str] = None  # signer name / signature text


class WorkOrderStamp(BaseModel):
    stamp_data: Optional[str] = None  # stamp text / seal reference


class StandardTermCreate(BaseModel):
    title: str
    body: str
    category: Optional[str] = None


class StandardTermResponse(StandardTermCreate):
    id: int
    is_active: int = 1
    model_config = ConfigDict(from_attributes=True)


# ---------- Vendor assignment (read-only; written by acceptance) ----------

class ProjectVendorAssignmentResponse(BaseModel):
    id: int
    project_id: int
    vendor_id: int
    vendor_name: Optional[str] = None
    work_order_id: int
    status: str
    assigned_at: Optional[datetime] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    scope: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)
