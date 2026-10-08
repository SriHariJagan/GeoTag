"""
GEOTECH demo reset + seed.

Wipes all business data, keeps the existing SUPERADMIN and the company profile,
then rebuilds a full working dataset so every screen has something real in it:

  * 6 users      -> 1 SUPERADMIN (kept) + 2 ADMIN + 3 SUPERVISORS
  * 6 vendors    -> ACTIVE, with contacts, capabilities and equipment
  * 8 machines   -> daily hire rates
  * 10 projects  -> across the whole status lifecycle
  * 14 work orders -> DRAFT / SENT / VIEWED / ACCEPTED / FINALIZED / COMPLETED
  * vendor acceptance -> assigns the accepted vendor to the project
  * daily execution reports -> real dates so machinery cost, attendance and
    day counts can be calculated from real data
  * expenditures -> approved, so budget / balance / cost ledger have numbers

The work-order team (supervisors + machines + per-day rates) is written exactly
as the API writes it, so the project cost ledger picks up the same rates.

Usage:
    .\\venv\\Scripts\\python.exe scripts\\reset_and_seed_demo.py

Flags:
    --keep-db    do not touch existing rows, only report what is missing
"""
from __future__ import annotations

import argparse
import json
import os
import random
import sys
from datetime import date, datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("ENV", "dev")

from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.core.security import hash_password  # noqa: E402

# models must be imported before metadata is used
import app.modules.company.models  # noqa: F401,E402
import app.modules.users.models  # noqa: F401,E402
import app.modules.vendors.models  # noqa: F401,E402
import app.modules.projects.models  # noqa: F401,E402
import app.modules.machinery.models  # noqa: F401,E402
import app.modules.procurement.models  # noqa: F401,E402
import app.modules.daily_execution.models  # noqa: F401,E402
import app.modules.project_expenditures.models  # noqa: F401,E402
import app.modules.Expenditure.models  # noqa: F401,E402

from app.modules.company.models import CompanySettings  # noqa: E402
from app.modules.users.models import (  # noqa: E402
    SupervisorProfile,
    User,
    UserExperience,
    UserSkill,
)
from app.modules.vendors.models import (  # noqa: E402
    Vendor,
    VendorCapability,
    VendorContact,
    VendorEquipment,
    VendorUser,
)
from app.modules.projects.models import (  # noqa: E402
    Project,
    ProjectAssignment,
    ProjectMachine,
    ProjectSupervisor,
    ProjectVendor,
)
from app.modules.machinery.models import Machine  # noqa: E402
from app.modules.procurement.models import (  # noqa: E402
    ProjectVendorAssignment,
    StandardTerm,
    WorkOrder,
    WorkOrderItem,
    WorkOrderVendor,
)
from app.modules.daily_execution.models import (  # noqa: E402
    DEREquipment,
    DERManpower,
    DERVendorActivity,
    DailyExecutionReport,
)
from app.modules.project_expenditures.models import ProjectExpenditure  # noqa: E402
from app.modules.users.audit import log_action  # noqa: E402

TODAY = date(2026, 3, 31)
random.seed(20260331)

ADMIN_PW = "Admin@12345"
SUP_PW = "Sup@123456"

# ---------------------------------------------------------------- helpers


def jd(value):
    return json.dumps(value)


def money(v):
    return round(float(v or 0), 2)


def wipe(db) -> None:
    """Delete every business row. company_settings and the superadmin survive."""
    keep_company = db.query(CompanySettings).count()
    keep_admin = db.query(User).filter(User.role == "SUPERADMIN").count()

    # child tables first, parents last
    for model in (
        DERVendorActivity, DEREquipment, DERManpower, DailyExecutionReport,
        ProjectExpenditure,
        WorkOrderVendor, WorkOrderItem, WorkOrder,
        ProjectVendorAssignment, StandardTerm,
        ProjectAssignment, ProjectMachine, ProjectSupervisor, ProjectVendor, Project,
        VendorEquipment, VendorCapability, VendorContact, VendorUser, Vendor,
        Machine, SupervisorProfile, UserExperience, UserSkill,
    ):
        db.query(model).delete(synchronize_session=False)

    # every user except the superadmin we are keeping
    db.query(User).filter(User.role != "SUPERADMIN").delete(synchronize_session=False)

    db.commit()
    print(f"  wiped business data (kept {keep_admin} superadmin, {keep_company} company settings)")


# ---------------------------------------------------------------- users

USERS = [
    # email, full name, role, designation, dept, emp id, phone
    ("admin.ops@geotech.example.com", "Ramesh Iyer", "ADMIN", "Operations Manager", "Operations", "EMP-100", "+91-98450-11001"),
    ("admin.finance@geotech.example.com", "Priya Nair", "ADMIN", "Finance Controller", "Finance", "EMP-101", "+91-98450-11002"),
    ("sup.arun@geotech.example.com", "Arun Kumar", "SUPERVISOR", "Senior Geotechnical Engineer", "Geotechnical", "EMP-201", "+91-98450-21001"),
    ("sup.meera@geotech.example.com", "Meera Shah", "SUPERVISOR", "Project Engineer", "Geotechnical", "EMP-202", "+91-98450-21002"),
    ("sup.vikram@geotech.example.com", "Vikram Rao", "SUPERVISOR", "Site Supervisor", "Field Operations", "EMP-203", "+91-98450-21003"),
]

SUPERVISOR_SPECS = {
    "sup.arun@geotech.example.com": {
        "years": 11.5, "geo": 9.0, "drill": 8.0, "site": 12.0, "pm": 4.0, "projects": 26,
        "specs": "SOIL_INVESTIGATION,BOREHOLE_DRILLING,SITE_SUPERVISION",
        "skills": [("Geotechnical Site Investigation", "EXPERT", 11.0),
                   ("Borehole Drilling Supervision", "ADVANCED", 8.0),
                   ("Soil Logging & Sampling", "EXPERT", 10.0)],
    },
    "sup.meera@geotech.example.com": {
        "years": 6.0, "geo": 5.5, "drill": 4.0, "site": 6.0, "pm": 2.0, "projects": 14,
        "specs": "ROCK_INVESTIGATION,SPT,SAMPLING,QUALITY_CONTROL",
        "skills": [("Rock Investigation", "ADVANCED", 5.0),
                   ("SPT & Field Testing", "EXPERT", 6.0),
                   ("Quality Control", "INTERMEDIATE", 3.0)],
    },
    "sup.vikram@geotech.example.com": {
        "years": 3.5, "geo": 2.5, "drill": 3.5, "site": 4.0, "pm": 1.0, "projects": 8,
        "specs": "SITE_SUPERVISION,SAFETY,BOREHOLE_DRILLING",
        "skills": [("Site Supervision", "ADVANCED", 4.0),
                   ("Site Safety", "INTERMEDIATE", 3.0),
                   ("Machinery Operations", "ADVANCED", 3.0)],
    },
}


def seed_users(db) -> dict:
    out = {}
    for email, name, role, desig, dept, emp, phone in USERS:
        u = User(
            email=email,
            full_name=name,
            first_name=name.split()[0],
            last_name=name.split()[-1],
            role=role,
            account_status="ACTIVE",
            is_active=True,
            hashed_password=hash_password(ADMIN_PW if role == "ADMIN" else SUP_PW),
            employee_id=emp,
            designation=desig,
            department=dept,
            employment_type="FULL_TIME",
            joining_date=date(2019, 4, 1) if role == "ADMIN" else date(2021, 6, 15),
            years_of_experience=SUPERVISOR_SPECS[email]["years"] if email in SUPERVISOR_SPECS else 8.0,
            primary_phone=phone,
            city="Hyderabad",
            state="Telangana",
            country="India",
            invite_accepted_at=datetime.utcnow(),
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(u)
        db.flush()
        out[email] = u

        db.add(UserExperience(
            user_id=u.id, company_name="GeoTech Engineering Pvt Ltd",
            job_title=desig, employment_type="FULL_TIME",
            start_date=u.joining_date, currently_working=True,
            location="Hyderabad, Telangana",
            description="Site investigation and field supervision.",
        ))
        for skill, prof, yrs in SUPERVISOR_SPECS.get(email, {}).get("skills", []):
            db.add(UserSkill(user_id=u.id, skill=skill, proficiency=prof, years_of_experience=yrs))

        if email in SUPERVISOR_SPECS:
            s = SUPERVISOR_SPECS[email]
            db.add(SupervisorProfile(
                user_id=u.id,
                supervisor_experience_years=s["years"],
                geotechnical_experience_years=s["geo"],
                drilling_experience_years=s["drill"],
                site_experience_years=s["site"],
                project_management_experience_years=s["pm"],
                projects_managed_count=s["projects"],
                specializations=s["specs"],
                current_availability="AVAILABLE",
            ))
    db.commit()
    print(f"  users: 1 superadmin (kept) + {len(USERS)} created ({sum(1 for u in USERS if 'SUPERVISOR' in u[2])} supervisors)")
    return out


# ---------------------------------------------------------------- vendors

VENDORS = [
    # legal name, code, contact, phone, email, city, type, cats, established
    ("Deccan Geotechnical Services Pvt Ltd", "VND-001", "Srinivas Rao", "+91-40-4455-1001", "accounts@deccan-geotech.example.com", "Hyderabad", "PVT_LTD", "GEOTECHNICAL_INVESTIGATION,SOIL_TESTING", 2011),
    ("Krishna Drilling & Borewells", "VND-002", "Anil Kumar", "+91-98450-22001", "projects@krishnadrilling.example.com", "Vijayawada", "PARTNERSHIP", "DRILLING,EQUIPMENT_RENTAL", 2009),
    ("TriAxis Materials Testing Lab", "VND-003", "Fatima Sheikh", "+91-40-6677-2002", "lab@triaxis.example.com", "Hyderabad", "PVT_LTD", "MATERIAL_TESTING,SOIL_TESTING", 2015),
    ("Sunrise Civil Works", "VND-004", "Ramesh Patil", "+91-98660-33001", "info@sunrisecivil.example.com", "Pune", "PVT_LTD", "CIVIL_WORKS,TRANSPORTATION", 2007),
    ("RockCore Exploration LLP", "VND-005", "Deepak Menon", "+91-98450-44001", "contact@rockcore.example.com", "Kochi", "LLP", "GEOTECHNICAL_INVESTIGATION,DRILLING", 2018),
    ("Vertex Survey Solutions", "VND-006", "Kavya Reddy", "+91-40-7788-3003", "hello@vertexsurvey.example.com", "Hyderabad", "PROPRIETORSHIP", "SURVEYING,ENGINEERING_CONSULTANCY", 2020),
]

VENDOR_EQUIPMENT = {
    "VND-001": [("DTH Drill Rig", "Rig 01", 2), ("Soil Sampling Kit", "Sampler A", 3)],
    "VND-002": [("Rotary Rig", "RB-40", 3), ("Truck-mounted Rig", "TM-12", 1)],
    "VND-003": [("Triaxial Test Rig", "TX-100", 1)],
    "VND-004": [("Excavator", "EX-20", 2), ("Tipper Truck", "TT-07", 4)],
    "VND-005": [("Core Drill Rig", "CD-9", 2)],
    "VND-006": [("Total Station", "TS-05", 3), ("GNSS Receiver", "GR-02", 4)],
}


def seed_vendors(db, admin) -> list:
    out = []
    for (name, code, contact, phone, email, city, btype, cats, est) in VENDORS:
        v = Vendor(
            vendor_company=name,
            legal_business_name=name,
            trading_name=name.split()[0],
            vendor_code=code,
            business_type=btype,
            status="ACTIVE",
            is_active=True,
            contact_person=contact,
            contact_designation="Project Manager",
            phone=phone,
            alternate_phone="",
            email=email,
            address=f"{random.randint(1, 90)} Station Road",
            registered_address=f"{random.randint(1, 90)} Station Road",
            city=city,
            state="Telangana" if city == "Hyderabad" else "Maharashtra",
            country="India",
            postal_code=f"5{random.randint(10000, 99999)}",
            registration_number=f"U{random.randint(10000, 99999)}",
            tax_identifier=f"{random.randint(1000, 9999)}ABCDE{random.randint(1000, 9999)}F",
            year_established=est,
            service_categories=cats,
            years_of_experience=TODAY.year - est,
            maximum_project_capacity=random.choice([25.0, 40.0, 60.0, 90.0]),
            manpower_capacity=random.choice([20, 35, 50, 80]),
            created_by=admin.id,
            status_changed_at=datetime.utcnow(),
        )
        db.add(v)
        db.flush()

        db.add(VendorContact(
            vendor_id=v.id, name=contact, designation="Project Manager",
            email=email, phone=phone, is_primary=True,
        ))
        for cat in cats.split(","):
            db.add(VendorCapability(vendor_id=v.id, category=cat,
                                    description=f"Registered capability: {cat.replace('_', ' ').title()}"))

        for eq in VENDOR_EQUIPMENT.get(code, []):
            etype, ename, qty = eq
            db.add(VendorEquipment(
                vendor_id=v.id, equipment_type=etype, equipment_name=ename,
                quantity=qty, condition="GOOD", ownership_type="OWNED",
                availability_status="AVAILABLE",
            ))
        out.append(v)
    db.commit()
    print(f"  vendors: {len(out)} ACTIVE with contacts, capabilities and equipment")
    return out


# ---------------------------------------------------------------- machines

MACHINES = [
    # name, type, rate/day
    ("Rig Alpha DTH-01", "DTH Drill Rig", 14500.0),
    ("Rig Beta DTH-02", "DTH Drill Rig", 15000.0),
    ("Rig Gamma CR-03", "Core Drill Rig", 13200.0),
    ("Rig Delta RB-04", "Rotary Drill Rig", 11800.0),
    ("Truck Rig TM-05", "Truck Mounted Rig", 16500.0),
    ("Crawler Rig CL-06", "Crawler Drill Rig", 17200.0),
    ("Excavator EX-07", "Excavator", 9800.0),
    ("Tractor TRL-08", "Tractor Trolley", 3200.0),
]


def seed_machines(db) -> list:
    out = []
    for name, mtype, rate in MACHINES:
        m = Machine(machine_name=name, machine_type=mtype,
                    rate_per_day=rate, status="active",
                    last_maintenance=TODAY - timedelta(days=random.randint(10, 90)))
        db.add(m)
        out.append(m)
    db.commit()
    print(f"  machines: {len(out)} with per-day hire rates")
    return out


# ---------------------------------------------------------------- projects

PROJECTS = [
    # code, name, client, engineer, location, status, budget, priority, start offset
    ("GEO-2026-001", "Metro Corridor Geotechnical Investigation", "Metro Rail Corporation", "S. Rangarajan", "Hyderabad–Secunderabad", "ACTIVE", 12500000.0, "CRITICAL", -120),
    ("GEO-2026-002", "Warehouse Foundation Investigation", "Sundar Logistics Pvt Ltd", "S. Rangarajan", "Pune, Hinjewadi", "ACTIVE", 6400000.0, "HIGH", -85),
    ("GEO-2026-003", "Bridge Approach Soil Testing", "State Roads Authority", "A. Fernandes", "Vijayawada", "ACTIVE", 8900000.0, "HIGH", -70),
    ("GEO-2026-004", "Residential Tower Soil Boreholes", "Prestige Builders", "A. Fernandes", "Bengaluru", "ACTIVE", 4200000.0, "MEDIUM", -60),
    ("GEO-2026-005", "Slope Stability Assessment", "Karnataka Tourism", "S. Rangarajan", "Coorg Hills", "ACTIVE", 3100000.0, "MEDIUM", -45),
    ("GEO-2026-006", "Port Expansion Marine Boreholes", "Adani Ports", "A. Fernandes", "Kandla", "PLANNED", 15700000.0, "HIGH", 14),
    ("GEO-2026-007", "Highway Widening Soil Survey", "National Highways Authority", "S. Rangarajan", "NH-16, Guntur", "PLANNED", 9800000.0, "HIGH", 21),
    ("GEO-2026-008", "Industrial Plot Bearing Capacity", "MRF Industries", "A. Fernandes", "Vizag", "DRAFT", 2200000.0, "LOW", 30),
    ("GEO-2026-009", "Dam Foundation Rock Investigation", "Water Resources Dept", "S. Rangarajan", "Godavari Basin", "DRAFT", 22000000.0, "CRITICAL", 45),
    ("GEO-2026-010", "Metro Depot Site Verification", "Metro Rail Corporation", "S. Rangarajan", "Nagole", "COMPLETED", 5600000.0, "MEDIUM", -180),
]


def seed_projects(db, admins, supervisors) -> list:
    out = []
    for i, (code, name, client, eic, loc, status, budget, prio, off) in enumerate(PROJECTS):
        start = TODAY + timedelta(days=off)
        p = Project(
            project_code=code, date=start.isoformat(), name=name,
            client_name=client, engineer_in_charge=eic, location=loc,
            planned_start_date=start,
            planned_end_date=start + timedelta(days=random.randint(90, 240)),
            actual_start_date=start if off < 0 else None,
            actual_end_date=(TODAY - timedelta(days=8)) if status == "COMPLETED" else None,
            project_budget=budget, currency="INR",
            project_type="Geotechnical Investigation",
            priority=prio, status=status,
            progress=100.0 if status == "COMPLETED" else (round(random.uniform(18, 82), 1) if status == "ACTIVE" else 0.0),
            total_boreholes=random.randint(12, 60),
            completed_boreholes=0,
            estimated_total_depth=random.randint(300, 1400),
            target_depth_per_day=round(random.uniform(6, 14), 1),
            target_boreholes_per_day=round(random.uniform(0.8, 2.2), 2),
            description=f"{name} for {client}. Scope includes borehole logging, SPT and laboratory testing.",
        )
        db.add(p)
        db.flush()

        # 1-2 supervisors per project
        sups = random.sample(supervisors, k=1 if i % 3 == 0 else 2)
        for j, s in enumerate(sups):
            db.add(ProjectAssignment(
                project_id=p.id, user_id=s.id, assignment_role="SUPERVISOR",
                status="COMPLETED" if status == "COMPLETED" else "ACTIVE",
                is_primary=(j == 0), start_date=start,
                end_date=(TODAY - timedelta(days=8)) if status == "COMPLETED" else None,
                assigned_by=admins[0].id, assigned_at=datetime.utcnow(),
            ))
            db.add(ProjectSupervisor(project_id=p.id, supervisor_id=s.id,
                                     assigned_at=start, is_active=status != "COMPLETED"))
        p.completed_boreholes = int(p.total_boreholes * (p.progress or 0) / 100)
        out.append(p)
    db.commit()
    print(f"  projects: {len(out)} across {sorted({p.status for p in out})}")
    return out


# ---------------------------------------------------------------- terms

TERMS = [
    ("Mobilisation Advance", "50% of the contract value shall be paid as mobilisation advance against bank guarantee and on deployment of rig and crew at site.", "COMMERCIAL"),
    ("Payment on Completion", "40% shall be released upon completion of the drilled depth and submission of the daily and consolidated field records.", "COMMERCIAL"),
    ("Retention", "10% of the contract value shall be retained until the final borehole log, SPT data and laboratory reports are accepted.", "COMMERCIAL"),
    ("Performance Guarantee", "The contractor shall furnish an unconditional performance guarantee equal to 5% of the contract value valid until defect liability period.", "COMMERCIAL"),
    ("Scope Confirmation", "The rates quoted are firm and fixed. Any additional depth below 30 m without written approval shall be paid at the quoted rate per metre.", "COMMERCIAL"),
    ("Statutory Compliance", "The contractor shall comply with all applicable statutory regulations, safety directives and site-specific environmental clearances.", "LEGAL"),
    ("Insurance", "The contractor shall maintain third-party liability insurance and workmen compensation cover for the entire period of the works.", "LEGAL"),
    ("Quality Assurance", "All samples shall be collected, labelled and preserved in accordance with IS 1892 and tested in an NABL-accredited laboratory.", "TECHNICAL"),
    ("Site Safety", "All personnel shall use mandated personal protective equipment. The contractor shall stop work during unsafe weather conditions.", "TECHNICAL"),
    ("Data Handover", "Original field records, calibrated instrument logs and photographic evidence shall be handed over within 7 days of demobilisation.", "TECHNICAL"),
    ("Dispute Resolution", "Any dispute shall first be referred to amicable negotiation between the Engineer-in-Charge and the contractor before arbitration.", "LEGAL"),
    ("Force Majeure", "Neither party shall be liable for failure to perform due to causes beyond reasonable control, provided prompt written notice is given.", "LEGAL"),
]


def seed_terms(db, admin) -> None:
    for title, body, cat in TERMS:
        db.add(StandardTerm(title=title, body=body, category=cat,
                            is_active=1, created_by=admin.id))
    db.commit()
    print(f"  standard terms: {len(TERMS)} available in the library")


# ---------------------------------------------------------------- work orders

BOQ_TEMPLATES = {
    "GEO-2026-001": [
        ("Borehole logging, 0-30 m, DTH method", "As per IS 1892 Part 1", 152.0, "MTR", 480.0),
        ("Borehole logging, 30-60 m, DTH method", "Incl. soil sample collection", 152.0, "MTR", 620.0),
        ("SPT in borehole at 1.5 m interval", "Standard penetration test", 100, "NOS", 850.0),
        ("Undisturbed soil sample collection", "Shelby tubes", 40, "NOS", 1200.0),
        ("Shallow water table observation", "Standpipe installation", 10, "NOS", 2400.0),
        ("Mobilisation and demobilisation of rig", "Per borehole location", 22, "NOS", 6500.0),
    ],
    "GEO-2026-002": [
        ("Borehole logging to 15 m depth", "Shallow foundation boreholes", 18, "MTR", 420.0),
        ("SPT at 1.0 m interval", "Dense sand zone", 15, "NOS", 900.0),
        ("Bulk soil sample for classification", "For lab testing", 10, "NOS", 750.0),
        ("Rig mobilisation and shifting", "Within plant premises", 18, "NOS", 4200.0),
    ],
    "GEO-2026-003": [
        ("Borehole logging to 20 m depth", "Bridge approach spans", 26, "MTR", 460.0),
        ("Soil sample collection & testing", "As per client schedule", 20, "NOS", 980.0),
        ("Groundwater monitoring piezometer", "PVC pipe 100 mm", 6, "NOS", 3200.0),
    ],
    "GEO-2026-004": [
        ("Borehole logging to 24 m depth", "Tower block footprints", 24, "MTR", 495.0),
        ("SPT in alternate boreholes", "Half open core", 12, "NOS", 880.0),
        ("Soil sample collection", "Undisturbed", 24, "NOS", 1100.0),
    ],
    "GEO-2026-005": [
        ("Subsurface investigation by shallow boreholes", "Slope profile sections", 12, "MTR", 540.0),
        ("Soil sample collection and testing", "Shear strength parameters", 12, "NOS", 1450.0),
        ("Trial pits", "2 m x 2 m x 1.5 m deep", 8, "NOS", 3600.0),
    ],
    "GEO-2026-006": [
        ("Marine borehole logging to 45 m", "Offshore seabed investigation", 24, "MTR", 2250.0),
        ("CPT execution", "Cone penetration test", 40, "NOS", 6800.0),
        ("Core sampling and retrieval", "Undisturbed marine cores", 30, "NOS", 5400.0),
    ],
    "GEO-2026-007": [
        ("Borehole logging along proposed alignment", "At 50 m chainage intervals", 120, "MTR", 410.0),
        ("Soil sample collection", "Topsoil and subsoil", 60, "NOS", 720.0),
        ("Topographic survey support", "Chainage and RL marking", 1, "LOT", 42000.0),
    ],
    "GEO-2026-008": [
        ("Borehole logging to 10 m depth", "Plot corners", 8, "MTR", 380.0),
        ("PLT / plate load test", "As per IS 875 Part 3", 2, "NOS", 8500.0),
    ],
    "GEO-2026-009": [
        ("Rock core drilling to 120 m depth", "Dam axis boreholes", 30, "MTR", 3150.0),
        ("Core logging and RQD computation", "With photographs", 30, "MTR", 640.0),
        ("In-situ permeability test", "Pack tests in boreholes", 12, "NOS", 12500.0),
    ],
    "GEO-2026-010": [
        ("Depot site verification boreholes", "Shallow to medium depth", 20, "MTR", 435.0),
        ("SPT at 1.5 m interval", "Across depot layout", 20, "NOS", 860.0),
        ("Final consolidated report", "With geological interpretation", 1, "LOT", 55000.0),
    ],
}

# stage, vendor_index_offset, machines_for_wo
WO_PLAN = [
    # (project idx, vendor idx, status, days of DER, machine idx list)
    (0, 0, "COMPLETED", 8, [0, 1]),
    (0, 0, "ACCEPTED", 6, [1]),
    (0, 1, "FINALIZED", 0, [2]),
    (1, 1, "ACCEPTED", 7, [3]),
    (1, 3, "SENT", 0, [4]),
    (2, 0, "ACCEPTED", 6, [0, 5]),
    (3, 1, "COMPLETED", 9, [3]),
    (4, 4, "ACCEPTED", 5, [2]),
    (5, 1, "DRAFT", 0, [5]),
    (5, 0, "DRAFT", 0, []),
    (6, 3, "FINALIZED", 0, [4, 6]),
    (7, 2, "SENT", 0, []),
    (8, 4, "DRAFT", 0, [5, 6]),
    (9, 0, "COMPLETED", 7, [0, 1]),
]


def seed_work_orders(db, admins, projects, vendors, machines, supervisors, company):
    by_code = {p.project_code: p for p in projects}
    assignments = {}
    for a in db.query(ProjectAssignment).all():
        assignments.setdefault(a.project_id, []).append(a)

    made = {"sent": 0, "accepted": 0, "finalized": 0, "completed": 0, "draft": 0}
    wos = []

    for idx, (pi, vi, stage, der_days, mids) in enumerate(WO_PLAN):
        project = projects[pi]
        vendor = vendors[vi]
        assignees = assignments.get(project.id, [])
        sups = [a.user_id for a in assignees if a.status == "ACTIVE"] or [supervisors[0].id]
        wo_machines = [machines[m] for m in mids]

        # work-order team written exactly as the API writes it
        team_sup = jd(sorted(set(sups)))
        team_mac = jd([
            {"machine_id": m.id, "machine_name": m.machine_name,
             "rate_per_day": money(m.rate_per_day)}
            for m in wo_machines
        ])

        boq = BOQ_TEMPLATES[project.project_code]
        subtotal = sum(q * r for _, _, q, _, r in boq)
        tax = money(subtotal * 0.18)
        grand = money(subtotal + tax)

        wo_no = f"GEOTECH/WO/{project.project_code}/WO-{idx + 1:02d}"
        wo_date = TODAY - timedelta(days=random.randint(30, 90))
        start = wo_date
        end = wo_date + timedelta(days=random.randint(45, 120))

        wo = WorkOrder(
            work_order_number=wo_no,
            project_id=project.id,
            vendor_id=vendor.id if stage != "DRAFT" else None,
            work_order_date=wo_date,
            project_name=project.name, client_name=project.client_name,
            location=project.location, site=project.name,
            work_type=project.project_type,
            scope_of_work=(f"{project.description} All field work shall be executed as per IS 1892 "
                           f"and the client specification, with daily records submitted without delay."),
            subject=f"Work Order for {project.name} — {project.location}",
            reference=f"Client enquiry {project.project_code}/GEO dated {wo_date.isoformat()}",
            intro_text=("Dear Sir,\n\n"
                        f"With reference to our quotation for {project.name} at {project.location}, "
                        "we are pleased to award the work described in this Work Order. The work shall be "
                        "executed in accordance with the scope, rates and terms set out herein.\n\n"
                        "Kindly acknowledge receipt and confirm your acceptance."),
            acceptance_text=("We confirm that the rates, quantities and terms stated in this Work Order are "
                             "accepted without deviation, and that the work will be completed to the "
                             "specified depth, standard and timeline."),
            subtotal=subtotal, tax_amount=tax, discount=0.0, other_charges=0.0,
            grand_total=grand, contract_value=grand if stage in ("FINALIZED", "COMPLETED") else 0.0,
            currency="INR",
            start_date=start, end_date=end,
            validity_days=30, completion_period=f"{random.randint(60, 120)} days from mobilisation",
            retention_percent=10.0,
            payment_terms="As per the payment schedule in the terms section.",
            tax_terms="GST @ 18% charged extra on the contract value.",
            delivery_terms="Field records within 7 days of completion.",
            special_conditions="Work may be suspended during monsoon without liability for delay.",
            payment_terms_json=jd([
                "50% mobilisation advance against bank guarantee on rig deployment.",
                "40% on completion of the drilled depth with daily records.",
                "10% retained until the final consolidated report is accepted.",
            ]),
            general_terms_json=jd([f"{t[0]}: {t[1]}" for t in TERMS[:6]]),
            team_supervisors_json=team_sup,
            team_machines_json=team_mac,
            signer_name="Ramesh Iyer", signer_designation="Operations Manager",
            vendor_signer_name=vendor.contact_person,
            vendor_signer_designation="Project Manager",
            status=stage,
            version=2 if stage in ("FINALIZED", "COMPLETED") else 1,
            is_locked=1 if stage in ("FINALIZED", "COMPLETED") else 0,
            pdf_version=1 if stage in ("FINALIZED", "COMPLETED") else 0,
            pdf_generated_at=datetime.utcnow() if stage in ("FINALIZED", "COMPLETED") else None,
            created_at=datetime.utcnow(), updated_at=datetime.utcnow(),
        )

        if stage in ("SENT", "VIEWED", "ACCEPTED", "FINALIZED", "COMPLETED"):
            wo.status = "ISSUED"
            wo.issued_by = admins[0].id
            wo.issued_at = wo_date + timedelta(days=1)
            wo.viewed_at = wo_date + timedelta(days=2)
            wo.signed_by = admins[0].id
            wo.signed_at = wo_date + timedelta(days=2)
            wo.stamped_by = admins[0].id
            wo.stamped_at = wo_date + timedelta(days=2)
            wo.stamp_data = "COMPANY SEAL"
            wo.finalized_by = admins[0].id
            wo.finalized_at = wo_date + timedelta(days=3)
            wo.reviewed_by = admins[0].id
            wo.reviewed_at = wo_date + timedelta(days=2)
            if stage == "COMPLETED":
                wo.accepted_by = admins[1].id
                wo.accepted_at = wo_date + timedelta(days=4)
                wo.completed_at = TODAY - timedelta(days=6)
            if stage == "ACCEPTED":
                wo.accepted_by = admins[1].id
                wo.accepted_at = wo_date + timedelta(days=4)
        db.add(wo)
        db.flush()

        for n, (desc, sub, qty, unit, rate) in enumerate(boq, start=1):
            db.add(WorkOrderItem(
                work_order_id=wo.id, item_number=str(n), description=desc,
                sub_description=sub, quantity=qty, unit=unit,
                unit_rate=rate, line_total=money(qty * rate),
            ))

        if wo.status == "ISSUED":
            inv_status = {"SENT": "SENT", "ACCEPTED": "ACCEPTED",
                          "FINALIZED": "ACCEPTED", "COMPLETED": "ACCEPTED"}[stage]
            db.add(WorkOrderVendor(
                work_order_id=wo.id, vendor_id=vendor.id, status=inv_status,
                sent_at=datetime.utcnow(), sent_by=admins[0].id,
                viewed_at=datetime.utcnow(),
                accepted_at=datetime.utcnow() if inv_status == "ACCEPTED" else None,
                accepted_by=admins[1].id if inv_status == "ACCEPTED" else None,
            ))
            if inv_status == "ACCEPTED":
                db.add(ProjectVendor(
                    project_id=project.id, vendor_id=vendor.id))
                db.add(ProjectVendorAssignment(
                    project_id=project.id, vendor_id=vendor.id,
                    work_order_id=wo.id, status="ACTIVE",
                    assigned_by=admins[0].id, assigned_at=datetime.utcnow(),
                    start_date=start, end_date=end,
                    scope=project.description or "Geotechnical investigation",
                ))

        for m in wo_machines:
            if not db.query(ProjectMachine).filter(
                    ProjectMachine.project_id == project.id,
                    ProjectMachine.machine_id == m.id).first():
                db.add(ProjectMachine(project_id=project.id, machine_id=m.id))
                m.status = "working"

        made[stage.lower()] = made.get(stage.lower(), 0) + 1
        wos.append((wo, project, vendor, sups, wo_machines, der_days, stage))
        db.flush()

    db.commit()
    # real issued work orders freeze vendor/project/company snapshots at
    # transition time; the seed writes rows directly, so backfill them here
    from app.modules.procurement.service import _take_snapshots
    for wo, _p, _v, *_ in wos:
        _take_snapshots(db, wo)
    db.commit()
    print(f"  work orders: {len(wos)} "
          f"({made.get('sent', 0)} sent, {made.get('accepted', 0)} accepted & project-assigned, "
          f"{made.get('finalized', 0)} finalized, {made.get('completed', 0)} completed, "
          f"{made.get('draft', 0)} draft)")
    return wos


# ---------------------------------------------------------------- DER + money

def seed_execution(db, admins, wos, projects, machines, client_persons):
    """Daily execution reports -> drives days worked, machinery cost, attendance."""
    reports = 0
    for wo, project, vendor, sups, wo_machines, days, stage in wos:
        if not days:
            continue
        # rotate who files the report so every assigned supervisor has attendance
        for d in range(days):
            rdate = TODAY - timedelta(days=days - d)
            owner = sups[d % len(sups)] if sups else supervisors[0].id
            if db.query(DailyExecutionReport).filter(
                    DailyExecutionReport.project_id == project.id,
                    DailyExecutionReport.created_by == owner,
                    DailyExecutionReport.report_date == rdate).first():
                continue
            machine = wo_machines[d % len(wo_machines)] if wo_machines else None
            soil = round(random.uniform(3, 9), 2)
            soft = round(random.uniform(1, 6), 2)
            hard = round(random.uniform(0, 4), 2)
            bh = f"BH-{project.project_code[-3:]}-{d + 1:02d}"
            rep = DailyExecutionReport(
                project_id=project.id, vendor_id=vendor.id, machine_id=machine.id if machine else None,
                borehole_started=bh, borehole_ended=bh,
                site_location=project.location, borehole_no=f"{project.project_code}/{bh}",
                rig_no=machine.machine_name if machine else "—",
                type_of_rig=machine.machine_type if machine else "—",
                chainage=f"{d * 25}-{d * 25 + 25} m",
                depth_started=soil + soft + hard, hours_worked=random.choice([6, 7, 8, 8, 9]),
                manpower_count=random.randint(4, 8),
                soil_depth=soil, soft_rock_depth=soft, hard_rock_depth=hard,
                total_depth=round(soil + soft + hard, 2),
                client=project.client_name,
                client_person_name=client_persons.get(project.id, "Site Engineer"),
                client_person_designation="Site Engineer",
                weather_condition=random.choice(["Clear", "Cloudy", "Light Rain"]),
                work_status="working",
                remarks="Field work as per approved methodology. No deviations reported.",
                report_date=rdate, created_by=owner, status="SUBMITTED",
                submitted_at=datetime.utcnow(),
                created_at=datetime.utcnow(), updated_at=datetime.utcnow(),
            )
            db.add(rep)
            db.flush()

            db.add(DERManpower(
                report_id=rep.id, category="FIELD", role="Drill crew",
                planned_count=6, actual_count=random.randint(5, 7),
                hours=random.choice([6, 7, 8, 8]),
            ))
            if machine:
                db.add(DEREquipment(
                    report_id=rep.id, machine_id=machine.id,
                    equipment_name=machine.machine_name, quantity=1,
                    hours_used=random.choice([6, 7, 8, 8]),
                    utilization=round(random.uniform(62, 95), 1),
                    condition="GOOD",
                ))
            db.add(DERVendorActivity(
                report_id=rep.id, vendor_id=vendor.id, work_order_id=wo.id,
                activity="Borehole drilling and logging",
                quantity_completed=round(random.uniform(4, 12), 2),
                progress=round(random.uniform(10, 92), 1),
            ))
            reports += 1
    db.commit()
    print(f"  daily execution reports: {reports} across {len({w[1].id for w in wos if w[5]})} projects")


def seed_expenditures(db, admins, wos, projects):
    made = 0
    cat_desc = {
        "MATERIAL": "Consumables and sampling tubes",
        "LABOR": "Skilled and unskilled site labour wages",
        "EQUIPMENT": "Machinery hire and standby charges",
        "FUEL": "Diesel for rig operation",
        "TRANSPORT": "Sample and equipment transportation",
        "SITE_EXPENSE": "Site establishment and camp expenses",
        "MISCELLANEOUS": "Sundry site consumables",
    }
    vendor_ids = [v.id for v in db.query(Vendor).filter(Vendor.status == "ACTIVE").all()]
    for project in projects:
        if project.status in ("DRAFT", "PLANNED"):
            continue
        spend = float(project.project_budget or 0) * random.uniform(0.04, 0.11)
        n = random.randint(4, 8)
        for _ in range(n):
            cat = random.choice(["MATERIAL", "LABOR", "EQUIPMENT", "FUEL", "TRANSPORT", "SITE_EXPENSE"])
            db.add(ProjectExpenditure(
                project_id=project.id,
                expense_date=TODAY - timedelta(days=random.randint(3, 120)),
                expense_category=cat, description=cat_desc[cat],
                amount=money(spend / n * random.uniform(0.6, 1.5)), currency="INR",
                vendor_id=random.choice(vendor_ids) if random.random() < 0.4 else None,
                payment_method=random.choice(["CASH", "UPI", "NEFT", "CHEQUE"]),
                reference_number=f"EXP/{random.randint(10000, 99999)}",
                status="APPROVED",
                created_by=random.choice(admins).id,
                approved_by=admins[0].id,
                approved_at=datetime.utcnow(),
                created_at=datetime.utcnow(), updated_at=datetime.utcnow(),
            ))
            made += 1
    db.commit()
    print(f"  expenditures: {made} approved across active and completed projects")


# ---------------------------------------------------------------- main

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--keep-db", action="store_true",
                    help="skip the wipe and only report existing data")
    args = ap.parse_args()

    print("GEOTECH demo reset + seed")
    print("-" * 52)

    db = SessionLocal()
    try:
        if args.keep_db:
            print("  --keep-db: nothing deleted")
        else:
            wipe(db)

        company = db.query(CompanySettings).first()
        if not company:
            print("  ! no company settings found - start the backend once first, then re-run")
            return

        superadmin = db.query(User).filter(User.role == "SUPERADMIN").first()
        if not superadmin:
            print("  ! no superadmin found - cannot continue")
            return

        print(f"  company:    {company.company_name}")
        print(f"  superadmin: {superadmin.email}")
        print("-" * 52)

        seed_users(db)
        admins = list(db.query(User).filter(
            User.role == "ADMIN", User.account_status == "ACTIVE").all())
        supervisors = list(db.query(User).filter(
            User.role == "SUPERVISOR", User.account_status == "ACTIVE").all())[:3]

        vendors = seed_vendors(db, superadmin)
        machines = seed_machines(db)
        projects = seed_projects(db, admins, supervisors)
        seed_terms(db, superadmin)

        client_persons = {
            projects[0].id: "S. Rangarajan", projects[1].id: "M. Joshi",
            projects[2].id: "K. Reddy", projects[3].id: "T. Nair",
            projects[4].id: "B. Kamath", projects[5].id: "R. Desai",
        }

        wos = seed_work_orders(db, admins, projects, vendors, machines, supervisors, company)
        seed_execution(db, admins, wos, projects, machines, client_persons)
        seed_expenditures(db, admins, wos, projects)

        log_action(db, action="DEMO_SEEDED", actor_id=superadmin.id,
                   target_type="system", metadata={"projects": 10, "vendors": 6})

        print("-" * 52)
        print("CREDENTIALS")
        print(f"  superadmin  {superadmin.email}")
        for e in USERS:
            print(f"  {e[2]:<11} {e[0]}   "
                  f"{ADMIN_PW if e[2] == 'ADMIN' else SUP_PW}")
        print("-" * 52)
        print("VERIFY AT")
        print("  /admin/projects                 - 10 projects, teams, vendors, machines")
        print("  /admin/work-orders              - 14 work orders at every stage")
        print("  /admin/work-orders/create       - studio (open an ACCEPTED order to duplicate)")
        print("  /admin/projects/1               - Cost Ledger tab (machinery cost, weekly, history)")
        print("  /supervisor/daily-execution-report - pick a project for spend history")
        print("  /admin/expenditures             - approved expenses")
        print("-" * 52)
        print("SEED DONE")
    finally:
        db.close()


if __name__ == "__main__":
    main()