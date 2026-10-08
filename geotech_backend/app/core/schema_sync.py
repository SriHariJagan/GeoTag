from sqlalchemy import inspect, text

from app.core.config import settings
from app.core.database import engine


SQLITE_COLUMNS = {
    "users": {
        "account_status": "VARCHAR DEFAULT 'INVITED'",
        "first_name": "VARCHAR",
        "middle_name": "VARCHAR",
        "last_name": "VARCHAR",
        "profile_photo": "VARCHAR",
        "gender": "VARCHAR",
        "date_of_birth": "DATE",
        "nationality": "VARCHAR",
        "secondary_email": "VARCHAR",
        "primary_phone": "VARCHAR",
        "secondary_phone": "VARCHAR",
        "country": "VARCHAR",
        "state": "VARCHAR",
        "city": "VARCHAR",
        "address_line1": "VARCHAR",
        "address_line2": "VARCHAR",
        "postal_code": "VARCHAR",
        "emergency_contact_name": "VARCHAR",
        "emergency_contact_relationship": "VARCHAR",
        "emergency_contact_phone": "VARCHAR",
        "emergency_contact_secondary_phone": "VARCHAR",
        "emergency_contact_email": "VARCHAR",
        "employee_id": "VARCHAR",
        "designation": "VARCHAR",
        "department": "VARCHAR",
        "employment_type": "VARCHAR",
        "joining_date": "DATE",
        "reporting_manager_id": "INTEGER",
        "years_of_experience": "FLOAT",
        "professional_summary": "TEXT",
        "current_specialization": "VARCHAR",
        "created_at": "DATETIME",
        "updated_at": "DATETIME",
        "invitation_expires_at": "DATETIME",
        "suspended_at": "DATETIME",
        "deactivated_at": "DATETIME",
    },
    "projects": {
        "planned_start_date": "DATE",
        "planned_end_date": "DATE",
        "actual_start_date": "DATE",
        "actual_end_date": "DATE",
        "project_budget": "FLOAT DEFAULT 0",
        "estimated_total_depth": "FLOAT DEFAULT 0",
        "target_depth_per_day": "FLOAT DEFAULT 0",
        "target_boreholes_per_day": "FLOAT DEFAULT 0",
    },
    "daily_execution_reports": {
        "machine_id": "INTEGER",
        "hours_worked": "FLOAT DEFAULT 0",
        "manpower_count": "INTEGER DEFAULT 0",
        "weather_condition": "VARCHAR",
        "delay_reason": "TEXT",
        "work_status": "VARCHAR DEFAULT 'working'",
        "status": "VARCHAR DEFAULT 'SUBMITTED'",
        "submitted_at": "DATETIME",
        "created_at": "DATETIME",
        "updated_at": "DATETIME",
    },
    # --- V3: vendor professional columns (all nullable; legacy rows untouched) ---
    "vendors": {
        "legal_business_name": "VARCHAR",
        "trading_name": "VARCHAR",
        "business_type": "VARCHAR",
        "registration_number": "VARCHAR",
        "tax_identifier": "VARCHAR",
        "year_established": "INTEGER",
        "status": "VARCHAR DEFAULT 'ACTIVE'",
        "contact_designation": "VARCHAR",
        "alternate_phone": "VARCHAR",
        "registered_address": "TEXT",
        "operational_address": "TEXT",
        "city": "VARCHAR",
        "state": "VARCHAR",
        "country": "VARCHAR",
        "postal_code": "VARCHAR",
        "service_categories": "TEXT",
        "specializations": "TEXT",
        "technical_capabilities": "TEXT",
        "operating_regions": "TEXT",
        "maximum_project_capacity": "FLOAT",
        "manpower_capacity": "INTEGER",
        "equipment_capacity": "INTEGER",
        "years_of_experience": "FLOAT",
        "updated_at": "DATETIME",
        "status_changed_at": "DATETIME",
        "created_by": "INTEGER",
        "updated_by": "INTEGER",
    },
    # --- V3: project descriptors + lifecycle ---
    "projects": {
        "planned_start_date": "DATE",
        "planned_end_date": "DATE",
        "actual_start_date": "DATE",
        "actual_end_date": "DATE",
        "project_budget": "FLOAT DEFAULT 0",
        "estimated_total_depth": "FLOAT DEFAULT 0",
        "target_depth_per_day": "FLOAT DEFAULT 0",
        "target_boreholes_per_day": "FLOAT DEFAULT 0",
        "description": "TEXT",
        "project_type": "VARCHAR",
        "priority": "VARCHAR",
        "currency": "VARCHAR DEFAULT 'INR'",
    },
    # --- V3: supervisor assignment extensions ---
    "project_assignments": {
        "is_primary": "BOOLEAN DEFAULT 0",
        "start_date": "DATE",
        "end_date": "DATE",
        "notes": "TEXT",
    },
    # --- V4: work-order wizard / sign-stamp-finalize (nullable; old rows untouched) ---
    "work_orders": {
        "work_order_date": "DATE",
        "project_name": "VARCHAR",
        "client_name": "VARCHAR",
        "site": "VARCHAR",
        "location": "VARCHAR",
        "work_type": "VARCHAR",
        "subtotal": "FLOAT DEFAULT 0",
        "discount": "FLOAT DEFAULT 0",
        "tax_amount": "FLOAT DEFAULT 0",
        "other_charges": "FLOAT DEFAULT 0",
        "grand_total": "FLOAT DEFAULT 0",
        "validity_days": "INTEGER",
        "completion_period": "VARCHAR",
        "retention_percent": "FLOAT",
        "tax_terms": "TEXT",
        "delivery_terms": "TEXT",
        "standard_terms": "TEXT",
        "custom_terms": "TEXT",
        "accepted_by": "INTEGER",
        "rejected_at": "DATETIME",
        "rejected_by": "INTEGER",
        "rejection_reason": "TEXT",
        "accept_ip": "VARCHAR",
        "reject_ip": "VARCHAR",
        "version": "INTEGER DEFAULT 1",
        "is_locked": "INTEGER DEFAULT 0",
        "reviewed_at": "DATETIME",
        "reviewed_by": "INTEGER",
        "pdf_generated_at": "DATETIME",
        "pdf_path": "VARCHAR",
        "pdf_version": "INTEGER DEFAULT 0",
        "signed_by": "INTEGER",
        "signed_at": "DATETIME",
        "signature_data": "TEXT",
        "stamped_by": "INTEGER",
        "stamped_at": "DATETIME",
        "stamp_data": "TEXT",
        "finalized_by": "INTEGER",
        "finalized_at": "DATETIME",
        # --- V5: corporate document fields + snapshots + version parent ---
        "parent_id": "INTEGER",
        "subject": "TEXT",
        "reference": "VARCHAR",
        "intro_text": "TEXT",
        "acceptance_text": "TEXT",
        "payment_terms_json": "TEXT",
        "general_terms_json": "TEXT",
        "vendor_override_json": "TEXT",
        "signer_name": "VARCHAR",
        "signer_designation": "VARCHAR",
        "vendor_signer_name": "VARCHAR",
        "vendor_signer_designation": "VARCHAR",
        "vendor_snapshot": "TEXT",
        "project_snapshot": "TEXT",
        "company_snapshot": "TEXT",
        # --- V6: WO team chosen inside the order ---
        "team_supervisors_json": "TEXT",
        "team_machines_json": "TEXT",
    },
    "machines": {
        "rate_per_day": "FLOAT",
    },
    "work_order_items": {
        "item_number": "VARCHAR",
        "sub_description": "TEXT",
    },
}


def sync_sqlite_schema():
    """Lightweight dev-only schema patching for SQLite create_all projects."""
    if not settings.DATABASE_URL.startswith("sqlite"):
        return

    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    with engine.begin() as conn:
        for table_name, columns in SQLITE_COLUMNS.items():
            if table_name not in existing_tables:
                continue

            existing_columns = {
                column["name"] for column in inspector.get_columns(table_name)
            }

            for column_name, column_type in columns.items():
                if column_name in existing_columns:
                    continue
                conn.execute(
                    text(
                        f"ALTER TABLE {table_name} "
                        f"ADD COLUMN {column_name} {column_type}"
                    )
                )

        # --- User Management V2 data migration (non-destructive) ---
        if "users" in existing_tables:
            # Backfill account_status from legacy is_active / invite_accepted_at.
            # NOTE: new columns default to 'INVITED', so also reconcile rows
            # where is_active=1 but status is still INVITED.
            conn.execute(text(
                "UPDATE users SET account_status = CASE "
                "WHEN is_active = 1 AND invite_accepted_at IS NOT NULL THEN 'ACTIVE' "
                "WHEN is_active = 1 THEN 'ACTIVE' "
                "ELSE 'INVITED' END "
                "WHERE account_status IS NULL OR account_status = '' "
                "OR (is_active = 1 AND account_status = 'INVITED')"
            ))
            # Normalize legacy lowercase superadmin role
            conn.execute(text(
                "UPDATE users SET role = 'SUPERADMIN' WHERE role = 'superadmin'"
            ))
            # Backfill timestamps where missing
            conn.execute(text(
                "UPDATE users SET created_at = CURRENT_TIMESTAMP "
                "WHERE created_at IS NULL"
            ))
            conn.execute(text(
                "UPDATE users SET updated_at = CURRENT_TIMESTAMP "
                "WHERE updated_at IS NULL"
            ))
        # --- V3 vendor migration (non-destructive) ---
        if "vendors" in existing_tables:
            # Backfill legal name from legacy company field; default status
            conn.execute(text(
                "UPDATE vendors SET legal_business_name = vendor_company "
                "WHERE (legal_business_name IS NULL OR legal_business_name = '') "
                "AND vendor_company IS NOT NULL"
            ))
            conn.execute(text(
                "UPDATE vendors SET status = 'ACTIVE' "
                "WHERE status IS NULL OR status = ''"
            ))

        # --- V3 DER migration: default status + daily uniqueness ---
        if "daily_execution_reports" in existing_tables:
            conn.execute(text(
                "UPDATE daily_execution_reports SET status = 'SUBMITTED' "
                "WHERE status IS NULL OR status = ''"
            ))
            conn.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS "
                "uq_der_day ON daily_execution_reports "
                "(project_id, created_by, report_date)"
            ))

        # --- V4: backfill canonical supervisor assignments from legacy links
        # (Supervisors tab reads project_assignments; legacy-only rows were
        # invisible there). Idempotent.
        if "project_assignments" in existing_tables and \
                "project_supervisors" in existing_tables:
            conn.execute(text(
                "INSERT INTO project_assignments "
                "(project_id, user_id, assignment_role, status, is_primary, "
                " assigned_at) "
                "SELECT ps.project_id, ps.supervisor_id, 'SUPERVISOR', 'ACTIVE', "
                " 0, CURRENT_TIMESTAMP "
                "FROM project_supervisors ps "
                "WHERE COALESCE(ps.is_active, 1) = 1 AND NOT EXISTS ("
                " SELECT 1 FROM project_assignments pa "
                " WHERE pa.project_id = ps.project_id "
                " AND pa.user_id = ps.supervisor_id "
                " AND pa.status = 'ACTIVE')"
            ))

        # --- V4: relax work_orders.vendor_id to nullable (wizard drafts exist
        # before vendor selection). One-time data-preserving rebuild. ---
        _relax_work_order_vendor(conn, existing_tables)

        # --- V5: number uniqueness becomes (number, version) so a corrected
        # Version 2 keeps the same WO number as Version 1. ---
        _migrate_wo_number_unique(conn)


def _migrate_wo_number_unique(conn) -> None:
    rows = conn.execute(text(
        "SELECT name, sql FROM sqlite_master WHERE type='index' "
        "AND tbl_name='work_orders'")).fetchall()
    names = {r[0] for r in rows}
    # Drop legacy single-column unique index (SQLAlchemy auto-name).
    for legacy in ("ix_work_orders_work_order_number",):
        if legacy in names:
            conn.execute(text(f'DROP INDEX IF EXISTS "{legacy}"'))
    # Composite unique (number, version); NULL-safe via COALESCE for old rows.
    if "uq_wo_number_version" not in names:
        conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_wo_number_version "
            "ON work_orders (work_order_number, version)"))
    # Backfill version where missing (legacy rows predate the column default).
    try:
        conn.execute(text(
            "UPDATE work_orders SET version = 1 WHERE version IS NULL"))
    except Exception:
        pass


def _relax_work_order_vendor(conn, existing_tables) -> None:
    if "work_orders" not in existing_tables:
        return
    cols = conn.execute(text("PRAGMA table_info(work_orders)")).fetchall()
    # PRAGMA table_info -> (cid, name, type, notnull, dflt, pk)
    vendor_col = next((c for c in cols if c[1] == "vendor_id"), None)
    if vendor_col is None or int(vendor_col[3]) == 0:
        return  # already nullable
    conn.execute(text("PRAGMA foreign_keys=OFF"))
    try:
        conn.execute(text("ALTER TABLE work_orders RENAME TO work_orders_legacy_v4"))
        # Indexes travel with the rename; drop legacy copies so the fresh
        # table can recreate them (auto-indexes for PK/UNIQUE are skipped).
        for (idx_name,) in conn.execute(text(
                "SELECT name FROM sqlite_master WHERE type='index' "
                "AND tbl_name='work_orders_legacy_v4' AND name LIKE 'ix\\_%' ESCAPE '\\'")).fetchall():
            conn.execute(text(f'DROP INDEX IF EXISTS "{idx_name}"'))
        from app.modules.procurement.models import (
            WorkOrder, WorkOrderItem, WorkOrderVendor, WorkOrderVersion,
            StandardTerm,
        )
        WorkOrder.__table__.create(bind=conn, checkfirst=True)
        try:
            WorkOrderItem.__table__.create(bind=conn, checkfirst=True)
            WorkOrderVendor.__table__.create(bind=conn, checkfirst=True)
            WorkOrderVersion.__table__.create(bind=conn, checkfirst=True)
            StandardTerm.__table__.create(bind=conn, checkfirst=True)
        except Exception:
            pass
        new_cols = [c[1] for c in
                    conn.execute(text("PRAGMA table_info(work_orders)")).fetchall()]
        old_cols = [c[1] for c in
                    conn.execute(text("PRAGMA table_info(work_orders_legacy_v4)")).fetchall()]
        shared = [c for c in new_cols if c in old_cols]
        collist = ", ".join(shared)
        conn.execute(text(
            f"INSERT INTO work_orders ({collist}) "
            f"SELECT {collist} FROM work_orders_legacy_v4"))
        conn.execute(text("DROP TABLE work_orders_legacy_v4"))
    finally:
        conn.execute(text("PRAGMA foreign_keys=ON"))
