# GeoTech Project Management System

GeoTech is a full-stack project management system for geotechnical field operations. It helps a super admin manage projects, supervisors, vendors, machinery, daily execution reports, expenditures, and forecasting insights for project delay and cost overrun risk.

## Repository Structure

```text
giotech/
  GeoTech-UI/          React + Vite frontend
  geotech_backend/     FastAPI backend with SQLite dev database
  ml_data/             Mock data, ML training scripts, trained model files
```

## Core Workflow

1. Admin logs in.
2. Admin creates a professional user profile (account starts INVITED, not active).
3. Admin sends an invitation link (single-use, 24h expiry).
4. User accepts the invitation and sets a password (account becomes ACTIVE).
5. Admin assigns a role (SUPERADMIN / ADMIN / SUPERVISOR / VENDOR). Active ≠ supervisor.
6. Admin assigns eligible (ACTIVE + SUPERVISOR) users to projects.
7. Admin onboards vendors, sends RFQs, collects quotations, evaluates, awards, and issues work orders. Vendor acceptance activates the project assignment.
8. Supervisors see only assigned projects and submit daily execution reports.
9. Supervisors record expenditure data (draft → submit → approve).
10. Admin dashboard shows project counts and operational stats.

> Details: `GEOTECH_PROJECT_DOCUMENTATION.md` → “USER MANAGEMENT V2” and “PROJECT / VENDOR / PROCUREMENT V3”. Architecture: `GEOTECH_V3_ARCHITECTURE.md`. Copy `geotech_backend/.env.example` → `.env` and `GeoTech-UI/.env.example` → `.env` (never commit `.env`).

## Tech Stack

- Frontend: React, Vite, Axios, React Router, Vitest
- Backend: FastAPI, SQLAlchemy, Pydantic, pytest
- Database: SQLite for local development
- ML: pandas, scikit-learn, joblib
- Auth: JWT bearer token flow

## Tests

```powershell
cd geotech_backend
.\venv\Scripts\python.exe -m pytest tests/ -q
```

```powershell
cd GeoTech-UI
npm.cmd run test
```

## Backend Setup

From the repository root:

```powershell
cd geotech_backend
.\venv\Scripts\python.exe -m pip install -r requirements.txt
```

If the virtual environment does not exist:

```powershell
cd geotech_backend
python -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt
```

Create or update `geotech_backend\.env`:

```env
DATABASE_URL=sqlite:///./geotech.db
SECRET_KEY=supersecretkey
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
SUPERADMIN_EMAIL=admin@geotech.com
SUPERADMIN_PASSWORD=Admin@123
SUPERADMIN_NAME=superadmin
FRONTEND_URL=http://localhost:5173
```

Run the backend:

```powershell
cd C:\Projects\GeoTech\giotech\geotech_backend
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

Backend URLs:

```text
API:     http://127.0.0.1:8000
Swagger: http://127.0.0.1:8000/docs
```

## Frontend Setup

From the repository root:

```powershell
cd GeoTech-UI
npm.cmd install
```

Create or update `GeoTech-UI\.env`:

```env
VITE_API_URL=http://127.0.0.1:8000
```

Run the frontend:

```powershell
cd C:\Projects\GeoTech\giotech\GeoTech-UI
npm.cmd run dev
```

Open:

```text
http://localhost:5173
```

Use `npm.cmd` in PowerShell if `npm` is blocked by execution policy.

## Analytics and Forecasting

The backend exposes these forecasting endpoints:

```text
GET /analytics/projects/{project_id}/delay-risk
GET /analytics/projects/{project_id}/cost-risk
GET /analytics/dashboard/insights
```

The analytics service looks for trained model files from:

```text
ml_data/models/
```

If model files are missing, the service falls back to explainable scoring logic.

These files are generated locally and are intentionally not committed:

```text
delay_classifier.pkl
delay_days_forecaster.pkl
cost_overrun_classifier.pkl
projected_cost_forecaster.pkl
overrun_percent_forecaster.pkl
feature_columns.json
```

## Mock Data and Model Training

Install ML dependencies:

```powershell
cd C:\Projects\GeoTech\giotech
.\geotech_backend\venv\Scripts\python.exe -m pip install -r ml_data\requirements-ml.txt
```

Generate mock data:

```powershell
.\geotech_backend\venv\Scripts\python.exe ml_data\scripts\generate_mock_data.py
```

This creates:

```text
ml_data/raw/projects.csv
ml_data/raw/daily_reports.csv
ml_data/raw/expenditures.csv
ml_data/raw/vendors.csv
ml_data/raw/machinery.csv
ml_data/raw/supervisors.csv
ml_data/processed/project_training_table.csv
```

Generated raw data, processed training tables, reports, Excel files, and model binaries are ignored by Git. Keep only the scripts, templates, and documentation in the repository.

Train forecasting models:

```powershell
.\geotech_backend\venv\Scripts\python.exe ml_data\scripts\train_forecasting_models.py
```

Training metrics are generated locally at:

```text
ml_data/reports/training_metrics.json
```

## Canonical Client Data Format

Ask the client to provide data that can be normalized into:

```text
ml_data/raw/projects.csv
ml_data/raw/daily_reports.csv
ml_data/raw/expenditures.csv
ml_data/raw/vendors.csv
ml_data/raw/machinery.csv
ml_data/raw/supervisors.csv
```

If they provide Excel files or an unclear folder, first convert their files into these canonical CSVs. The model training should depend on this normalized format, not on arbitrary client folder structure.

## Verification Commands

Check backend imports and SQLAlchemy mappings:

```powershell
cd C:\Projects\GeoTech\giotech\geotech_backend
.\venv\Scripts\python.exe -c "from app.main import app; from sqlalchemy.orm import configure_mappers; configure_mappers(); print(app.title, 'mappers ok')"
```

Check model loading:

```powershell
cd C:\Projects\GeoTech\giotech\geotech_backend
.\venv\Scripts\python.exe -c "from app.modules.analytics.service import _load_model; print(bool(_load_model('delay_classifier')), bool(_load_model('projected_cost_forecaster')))"
```

Check frontend build:

```powershell
cd C:\Projects\GeoTech\giotech\GeoTech-UI
npm.cmd run build
```

Check generated data row counts:

```powershell
cd C:\Projects\GeoTech\giotech
.\geotech_backend\venv\Scripts\python.exe -c "import pandas as pd; print(len(pd.read_csv('ml_data/raw/projects.csv')), len(pd.read_csv('ml_data/raw/daily_reports.csv')), len(pd.read_csv('ml_data/raw/expenditures.csv')), len(pd.read_csv('ml_data/processed/project_training_table.csv')))"
```

Expected current generated counts:

```text
500 18807 18807 500
```

## Git Notes

The nested backend Git repository was disconnected by renaming:

```text
geotech_backend/.git -> geotech_backend/.git.disabled
```

`GeoTech-UI` currently has no nested `.git` directory. The active Git repository is the root:

```text
C:\Projects\GeoTech\giotech\.git
```

## Common Issues

PowerShell blocks `npm`:

```powershell
npm.cmd run dev
```

Backend cannot import packages:

```powershell
cd geotech_backend
.\venv\Scripts\python.exe -m pip install -r requirements.txt
```

Analytics endpoint does not use models:

```powershell
cd C:\Projects\GeoTech\giotech
.\geotech_backend\venv\Scripts\python.exe ml_data\scripts\train_forecasting_models.py
```

Then restart the backend.
