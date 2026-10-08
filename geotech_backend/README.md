# GeoTech Backend (FastAPI)

This repository contains the backend API for the **GeoTech Project Management System**, built using **FastAPI** and **SQLAlchemy** with a modular, scalable architecture.

The goal of this project is to support geotechnical project workflows such as project management, supervisor reporting, vendor & machinery tracking, and future laboratory modules.

---

## 🚀 Tech Stack

* **Backend Framework**: FastAPI
* **Language**: Python 3.10+
* **ORM**: SQLAlchemy
* **Database (Dev)**: SQLite
* **Database (Prod-ready)**: PostgreSQL / MySQL
* **Auth (Planned)**: JWT-based authentication
* **API Docs**: Swagger (Auto-generated)

---

## 📁 Project Folder Structure

```
geotech-backend/
│
├── app/
│   ├── main.py
│   │
│   ├── core/
│   │   ├── __init__.py
│   │   ├── config.py          # Environment variables & settings
│   │   ├── database.py        # SQLAlchemy engine, session, Base
│   │   ├── security.py        # JWT, password hashing (future)
│   │
│   ├── modules/
│   │   ├── users/
│   │   │   ├── __init__.py
│   │   │   ├── models.py      # User table & roles
│   │   │   ├── schemas.py     # Request & response schemas
│   │   │   ├── router.py      # User APIs
│   │   │   ├── service.py     # Business logic
│   │   │
│   │   ├── projects/
│   │   │   ├── __init__.py
│   │   │   ├── models.py
│   │   │   ├── schemas.py
│   │   │   ├── router.py
│   │   │
│   │   ├── reports/
│   │   │   ├── __init__.py
│   │   │   ├── models.py
│   │   │   ├── schemas.py
│   │   │   ├── router.py
│   │   │
│   │   ├── vendors/
│   │   │   ├── __init__.py
│   │   │   ├── models.py
│   │   │   ├── schemas.py
│   │   │   ├── router.py
│   │   │
│   │   ├── machinery/
│   │   │   ├── __init__.py
│   │   │   ├── models.py
│   │   │   ├── schemas.py
│   │   │   ├── router.py
│   │
│   ├── utils/
│   │   ├── __init__.py
│   │   ├── dependencies.py   # Role-based guards & shared deps
│   │
│   └── __init__.py
│
├── requirements.txt
├── .env
└── README.md
```

---

## 🧠 Architectural Principles

### 1. Modular Design

Each business feature lives in its own module (users, projects, reports, etc.).
This allows:

* Easy scaling
* Clean separation of concerns
* Independent feature development

### 2. Layered Responsibility

| Layer   | Responsibility                    |
| ------- | --------------------------------- |
| Router  | Handles HTTP requests & responses |
| Service | Business logic & validations      |
| Models  | Database schema                   |
| Schemas | API input/output validation       |

❗ **Rule**: No database logic inside routers.

---

## 👥 User Roles

### Super Admin

* Dashboard overview
* Create & manage projects
* Add vendors, machinery, supervisors
* Assign supervisors, vendors, machinery to projects
* View daily execution reports
* Invite supervisors via email

### Supervisor

* Login using invited account
* View assigned projects only
* Submit daily execution reports
* Manage profile

---

## 🔁 Core Workflow

1. Super Admin creates a project
2. Assigns supervisors, vendors & machinery
3. Supervisor logs in
4. Supervisor submits daily execution report
5. Super Admin reviews progress

---

## ⚙️ Environment Setup

### 1. Create Virtual Environment

```bash
python -m venv venv
venv\Scripts\activate   # Windows
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Environment Variables (`.env`)

```
DATABASE_URL=sqlite:///./geotech.db
SECRET_KEY=supersecretkey
```

---

## ▶️ Running the Application

```bash
python -m uvicorn app.main:app --reload
```

* API Base URL: `http://127.0.0.1:8000`
* Swagger Docs: `http://127.0.0.1:8000/docs`

---

## 🗄️ Database Strategy

* **Development**: SQLite
* **Production**: PostgreSQL / MySQL

Only the `DATABASE_URL` needs to be changed.
No ORM code changes required.

---

## 🔐 Authentication (Planned)

* JWT-based authentication
* Role-based access control
* Dependency-based permission checks

---

## 🧪 Future Modules (Planned)

* Laboratory module (soil & rock testing reports)
* Analytics dashboard
* Notification system
* Mobile API support

---

## 📌 Best Practices Followed

* Clean architecture
* API-first design
* Scalable folder structure
* Production-ready database abstraction

---

## 📞 Contact

Developer: **Jagan Mushini**

This README acts as a **single source of truth** for understanding, maintaining, and extending the GeoTech backend.
