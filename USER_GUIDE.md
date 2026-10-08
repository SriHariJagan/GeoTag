# GeoTech Operations Platform — Complete Project Guide

> **Document:** End-to-end operations manual for the GeoTech web application
> **Audience:** Non-technical — management, admins, supervisors, auditors.
> No technical knowledge needed. Share freely (email, print, or export to PDF).
>
> **Contents**
> 1. Product overview · 2. Roles & access · 3. Accounts: creation → invite →
>    activation → daily use · 4. The master workflow (job start to finish) ·
> 5. Purchasing in detail · 6. Work orders in detail · 7. Daily reports in detail ·
> 8. Expenditures in detail · 9. Vendors, machines & company setup ·
> 10. Oversight (dashboard, logs, audit) · 11. Status reference ·
> 12. Requirements checklists · 13. Troubleshooting & FAQ · 14. Glossary

---

## 1. Product overview

**GeoTech** is the company's single system for running geotechnical investigation
work — soil and rock studies for metro lines, dams, towers, roads and industrial
plots. Before this system, that work lived in phone calls, registers and
spreadsheets. Now everything lives in one audited place:

| What the app holds | Example |
|--------------------|---------|
| **Projects** — each job: client, site, budget, team, progress | `GEO-2026-009 — Dam Foundation Rock Investigation` |
| **Daily Execution Reports (DER)** — the site diary: boreholes, rigs, depths, hours, manpower | `BH-12 · 24.5 m · 8 hrs` |
| **Purchasing** — RFQ (asking prices) → quotations → awarding one winner → formal work order | `RFQ-9-001 → WO GEOTECH/WO/…` |
| **Expenditures** — site spending (fuel, labour, material) with approvals | `₹12,400 fuel · APPROVED` |
| **People, vendors, machines** — staff accounts, vendor companies, rigs/equipment | `Vertex Survey Solutions (VND-006)` |
| **Activity log** — tamper-evident diary of who did what, when | `WORK_ORDER_SENT by Admin, 10:24` |

Everyone opens the **same login page** (the link your administrator gives you).
After login, each person sees a different world, decided by their **role**.

---

## 2. Roles & access — who can do what

There are exactly **five** roles. A person's role is fixed at invitation time and
can only be changed by an administrator (nobody can raise their own role).

### 2.1 Superadmin — the owner account
- Everything in the system, including the two destructive actions nobody else has:
  **deleting users** and **deleting projects**.
- Manages admins, roles, account activation/suspension.
- Typically 1–2 people. This guide assumes one superadmin exists from day one.

### 2.2 Admin — runs the business day to day
- **People:** create users, invite them, edit them, suspend/reactivate accounts,
  change roles. (Cannot delete users — Superadmin only.)
- **Projects:** create, edit, assign teams, move statuses. (Cannot delete projects.)
- **Purchasing:** the entire RFQ → award → work-order chain, signatures, stamps.
- **Reports & money:** edit any daily report, approve/reject supervisor edit
  requests, approve/reject expenditures.
- **Masters:** vendors, machines, company letterhead used on official PDFs.
- Sees the dashboard. Sees everything except user/project deletion.

### 2.3 Supervisor — field staff (e.g. Meera, Arun)
- Sees **only the projects assigned to them** — nothing else exists for them.
- Files **Daily Execution Reports** for those projects; edits drafts; submits.
- Records **expenses** (several at once), edits drafts, submits for approval.
- **Edits their own profile** (name, phone, address, photo details, skills,
  experience, documents). Cannot touch role, login email, or anyone else's data.
- Views work orders of assigned projects. No purchasing, no approvals, no admin pages.

### 2.4 Vendor — vendor companies (portal exists; daily operation is admin-driven)
- A vendor portal exists (RFQs, work orders, projects of their organisation).
- **Current working method:** vendors do NOT log in. The admin sends requests,
  records their replies (viewed / accepted / declined + reason) and enters the
  prices they quote by phone/email. Every such entry is audit-logged under the
  admin's name.

### 2.5 Monitor — read-only oversight (e.g. the monitoring admin)
- Sees every admin view, the dashboard and the activity log.
- **Cannot click any action button anywhere.** If a button is missing, that is the
  role working as designed — not a fault.

### 2.6 Access matrix (summary)

| Area | Superadmin | Admin | Supervisor | Vendor | Monitor |
|------|-----------|-------|-----------|--------|---------|
| Users: create/invite/edit | ✅ | ✅ | own profile only | — | view |
| Users: delete | ✅ | ❌ | ❌ | ❌ | ❌ |
| Projects: create/edit/assign | ✅ | ✅ | assigned, view | assigned orgs, view | view |
| Projects: delete | ✅ | ❌ | ❌ | ❌ | ❌ |
| Daily reports: file/edit own drafts | ✅ | ✅ | ✅ assigned | ❌ | view |
| Daily reports: edit anyone / approve fixes | ✅ | ✅ | ❌ | ❌ | ❌ |
| Expenses: record/submit | ✅ | ✅ | ✅ assigned | ❌ | view |
| Expenses: approve/reject | ✅ | ✅ | ❌ | ❌ | ❌ |
| RFQ → award → work order | ✅ | ✅ | view WO only | (portal) | view |
| Sign / stamp / finalize WO | ✅ | ✅ | ❌ | ❌ | ❌ |
| Vendors/machines/company | ✅ | ✅ | names in context | own org | view |
| Activity log (restricted email) | ✅ | ✅ | ❌ | ❌ | ✅ |
| Dashboard | ✅ | ✅ | ❌ | ❌ | ✅ |

---

## 3. Accounts in full — creation → invite → activation → daily use

This is the front door of the system. Every person, including the first admin,
enters through this exact flow.

### 3.1 Step 1 — Admin creates the user (2 minutes)
Admin opens **Users → Create User** and enters: full name, **email** (this becomes
the login identity and can never be changed later), role, and basic details
(phone, designation, department, employee ID). The account is born in state
**INVITED** — it cannot log in yet.

> **Collect before you start:** correct email spelling, correct role, phone number.
> Email mistakes mean re-creating the account.

### 3.2 Step 2 — The system sends the invitation (automatic)
On invite, the system:
1. Creates a **single-use, secret sign-in link** (valid **24 hours**).
2. Emails it to the person with their name, role and organisation.
3. Cancels any older unused links for that person (only the newest link works).

If the person never clicks in 24 hours, the link **expires** — the admin simply
**resends** the invite (old links die automatically). An admin can also **revoke**
an invite (e.g. wrong email), which kills the link instantly.

### 3.3 Step 3 — The person accepts (their only job)
1. Opens the email link → lands on the **Accept Invite** page (the page first
   checks the link is genuine and unexpired, and shows their name/role).
2. Sets a password. Rules (enforced, no exceptions):
   **minimum 8 characters, with at least one lowercase, one UPPERCASE and one digit**
   (e.g. `Sitework@2026`).
3. Account flips to **ACTIVE** immediately — they can log in right away.

Used, revoked or expired links show a clear error ("Invalid or expired
invitation", "already accepted") — the fix is always: admin resends.

### 3.4 Step 4 — Daily login & account states
- Login = email + password. Every login time is recorded on the profile.
- **ACTIVE** — normal use. **INVITED** — hasn't accepted yet.
  **SUSPENDED / DEACTIVATED** — blocked by admin, cannot log in
  (used for exits or discipline; history is preserved, nothing is deleted).
- Nobody can suspend their own account or change their own role — the system
  refuses, even for admins.

### 3.5 Step 5 — Becoming field-ready (supervisors)
A supervisor account alone sees an **empty** system. Two more admin actions make
them operational:
1. **Eligibility is automatic**: ACTIVE account + SUPERVISOR role = assignable.
2. **Assignment**: admin assigns them to each project (primary or supporting).
   Only then do those projects, their vendors/machines, and report/expense filing
   appear for that supervisor.
3. The supervisor completes their **profile** (photo, experience, skills with
   proficiency bars, documents) — the admin sees a completeness score.

---

## 4. The master workflow — one job, start to finish

Follow one job through the whole company. Handoffs between roles are marked 👉.

1. **Admin creates the project** (Projects → Add): code, name, client, site,
   dates, budget. Status: **Draft**. *(Needs: client name, site location, budget.)*
2. **Admin assigns the team**: supervisors (must be eligible/active), vendors,
   machines. Status: **Draft → Planned → Active**.
3. 👉 **Admin runs purchasing** (Chapter 5): RFQ → collect prices → award one
   vendor → generate the **work order**.
4. 👉 **Admin issues the work order** (Chapter 6): send → vendor reply recorded →
   Issue (value frozen) → Sign → Stamp → **Finalize & lock**.
5. 👉 **Supervisor executes daily** (Chapter 7): opens assigned project → files
   **Daily Execution Report** every working day → submits (locks).
6. 👉 **Supervisor spends & records** (Chapter 8): fuel/labour/material entries →
   submits → 👉 **admin approves** (or rejects with reason).
7. **Vendor does the job**; supervisor tracks boreholes/depths against targets.
8. **Corrections**: submitted report wrong? Supervisor **requests a fix with a
   reason** → admin **approves** (reopens as draft) or **rejects** (with note) →
   supervisor fixes → resubmits (locks again; further fixes need a fresh request).
9. **Admin closes out**: work order Start Progress → Complete → Close; project
   Active → Completed → Closed.
10. **Oversight throughout** (Chapter 10): dashboard totals, per-project spend
    ledger, and the activity log record every step above with actor + time.

```
Invite → Activate → Assign → Plan → RFQ → Award → Work Order → Issue/Sign/Stamp
   → Daily Reports + Expenses (submit → approve) → Complete → Close → Audit
```

---

## 5. Purchasing in detail (RFQ → quotation → award)

**Rule #1: one award per RFQ, and it is final.** Changing the winner later is not
possible — a new purchase needs a new RFQ.

1. **Create RFQ** (Procurement → Create): project, title, scope. Status **Draft**.
2. **Add line items**: what exactly is priced (e.g. "Rotary drilling — 5 nos").
3. **Invite vendors**: search by name/code/email/phone, tick several, **Send**.
   Each invite is tracked: `Sent → Viewed → Quoted / Declined`. Already-invited
   vendors are hidden from the picker; re-sending to them is harmless (skipped).
4. **Record replies**: as vendors respond offline, mark **Viewed / Declined**
   per row (declines need no reason at RFQ stage).
5. **Enter vendor price**: pick the vendor → type the **rate per line item**
   exactly as quoted → lead time → valid-until date → Save. Numbering
   (`Q-…`), subtotal and total compute automatically. A vendor may re-quote;
   the old quote is kept as history (Superseded), never overwritten.
6. **Score** each *submitted* quote: Technical 0–100 + Commercial 0–100.
   Draft quotes (never sent by the vendor) **cannot** be scored or awarded.
7. **Pick winner → Confirm award** with a written reason (e.g. "Lowest compliant +
   fastest mobilisation"). All losing quotes flip to *not accepted* automatically.
8. **Generate Work Order** for the winner (scope defaults to the RFQ scope) — you
   land on the work-order page, and the RFQ page lists it permanently with full
   vendor-response history (who got it, who accepted, who declined and why).

---

## 6. Work orders in detail

A work order is the formal, signable job instruction. Its value and document are
**frozen at Issue** — later edits require a new version (old versions are kept
forever, never overwritten).

| Step | What it means | Who |
|------|---------------|-----|
| Draft | Being prepared, fully editable | Admin |
| Send to vendors | Invite one or more vendors; replies recorded with dates/reasons | Admin |
| Issue | **Freezes the contract value** | Admin |
| Sign → Stamp → Finalize | Named signature, seal, then **lock** | Admin |
| Accept / Decline | Vendor's reply (recorded by admin, with reason if declined); first acceptance pins the vendor and activates the project assignment | Admin records |
| Start Progress → Complete → Close | Execution tracking to closure (or Cancel) | Admin |
| PDF / Verify | Generate the official PDF; any signed file can be SHA-256 verified | Admin (Monitor can open PDFs) |

Supervisors see work orders of their projects read-only; every action, signature
and document version is audit-logged.

---

## 7. Daily Execution Reports in detail

- **Who files:** supervisors, for assigned projects only (the system refuses
  unassigned ones with "Not assigned to this project").
- **The form:** pick project (searchable, assigned-only) → project snapshot
  auto-loads (client, site, budget, progress, team) → vendor auto-filters to that
  project → borehole/rig details → depths (**total auto-adds**) → day summary →
  **Create** (or save as **Draft** first).
- **Draft vs Submitted:** drafts are editable; Submit **locks** the report.
- **The correction loop:** Request edit (+ reason) → *Awaiting admin* →
  **Approved** (reopens as Draft → fix → resubmit → locked again; further fixes
  need a fresh request) or **Declined** (reason shown, may ask again).
- **Admin side:** an *Edit requests* panel with pending counter, status tabs
  (Pending/Approved/Declined/All), per-request report links, approve-with-note /
  reject-with-required-reason, and a decided history showing whether the
  supervisor already resubmitted.

---

## 8. Expenditures in detail

- **Who records:** supervisors, per assigned project. The entry screen starts with
  a **project picker** — picking it first shows that project's **history**
  (record count, draft/submitted/approved totals, last 5 records) so duplicates
  are avoided, then the new rows go to that project.
- **Multi-row entry:** add as many rows as needed (date, category, description,
  amount), live total, per-row validation, per-row save status
  (Saving… / Saved ✓ / error kept editable), one summary toast.
- Categories: Material, Labour, Equipment, Fuel, Transport, Vendor, Subcontract,
  Site expense, Miscellaneous.
- **Draft → Submitted → Approved / Rejected** (rejections carry the admin's
  reason). Only drafts are editable. Server totals feed each project's
  auto-computed spend ledger (machinery/day + extras + weekly + history).

---

## 9. Vendors, machines & company setup (admin)

- **Vendors:** full profile (business details, contacts, capabilities, experience,
  equipment, certifications, documents, linked portal users, RFQ/work-order/
  project history, audit). Status ladder:
  **Prospect → Active** (can receive work) → **Suspended / Blacklisted**
  (blocked from new work). Only Active vendors can be invited or awarded.
- **Machines:** rigs/equipment with rates; assigned to projects; feed the
  supervisor-attendance and cost-ledger math automatically.
- **Company settings:** name, logo, letterhead, tax details and the work-order
  numbering format — this is what prints on every official PDF.

---

## 10. Oversight — dashboard, logs, audit

- **Dashboard** (Superadmin/Admin/Monitor): project, people, vendor, machine and
  report totals at a glance.
- **Activity Log** (restricted oversight account + admins): every create, update,
  approval, assignment and decision across the platform, filterable by user,
  action, area and date.
- **Audit trails** also live inside each record (project timeline, work-order
  versions, RFQ history, user audit) — nothing important happens without an
  actor + timestamp.

---

## 11. Status reference (all lifecycles)

| Area | Lifecycle |
|------|-----------|
| Account | Invited → Active → Suspended / Deactivated |
| Invitation link | Sent → Accepted / Expired (24 h) / Revoked |
| Project | Draft → Planned → Active → Completed → Closed (branches: On Hold, Cancelled) |
| Assignment | Active → Completed / Removed |
| RFQ | Draft → Sent → Awarded → Closed / Cancelled |
| RFQ invite | Sent → Viewed → Quoted / Declined / Expired |
| Quotation | Submitted → Evaluated → Awarded / Rejected (Superseded = replaced by newer quote) |
| Work order | Draft → Review → PDF → Signed → Stamped → Finalized → Issued → Viewed → Accepted/Rejected → In Progress → Completed → Closed (Cancelled anytime before close) |
| DER | Draft (editable) → Submitted (locked; fix via approved request) |
| Edit request | Pending → Approved (unlocks) / Rejected (stays locked) |
| Expense | Draft → Submitted → Approved / Rejected |
| Vendor | Prospect → Active → Suspended / Blacklisted |

---

## 12. Requirements checklists (copy-paste ready)

**To onboard a person:** ☐ correct email ☐ role decided ☐ phone/designation ☐
invitation sent ☐ they accept within 24 h (password: 8+ chars, upper+lower+digit)
☐ (supervisor) assigned to projects ☐ profile completed.

**To start a project:** ☐ code + name ☐ client + site ☐ dates + budget
☐ supervisors/vendors/machines assigned ☐ status moved to Active.

**To buy through RFQ:** ☐ line items ☐ ≥2 vendors invited ☐ prices entered
☐ quotes scored ☐ winner + written reason ☐ work order generated.

**To run a site day:** ☐ DER filed before day-end ☐ expenses recorded
☐ drafts submitted ☐ corrections requested where needed.

---

## 13. Troubleshooting & FAQ

- **Empty lists after login** → no assignment (supervisor) or nothing created yet.
  Contact your admin.
- **"Project/report not found — deleted or you lack access"** → gone, or outside
  your role/assignments. Normal protection, not a fault.
- **Missing buttons** → your role doesn't include that action.
- **Invite link fails** → used, revoked, or older than 24 h → admin resends.
- **Password rejected** → needs 8+ characters with upper, lower and digit.
- **Forgot password** → click **Forgot password?** on login → enter registered
  email → 6-digit code by email (10 min, 5 tries) → enter it → one-time reset link
  by email (30 min, single use) → type the new password **twice** (must match) →
  log in. No mailbox access any more? Contact your administrator.
- **Submitted report won't edit** → use **Request edit**, await approval.
- **Can't award / only submitted quotes qualify** → vendor quotes marked draft
  don't count; enter/record the price first.
- **"RFQ already awarded"** → final by design; start a new RFQ for re-purchase.
- **Login fails suddenly** → account may be Suspended/Deactivated — contact admin.
- **Who fixes what:** access/assignments/approvals → **Admin**; deletions, roles,
  oversight data → **Superadmin**.

---

## 14. Glossary

| Word | Plain meaning |
|------|---------------|
| RFQ | "How much for this work?" — the priced request to vendors |
| Quotation | A vendor's priced reply (per line item) |
| Award | The recorded decision: this vendor wins, for this reason |
| Work order | The formal signed job instruction to the winner |
| DER | Daily Execution Report — the site's daily diary |
| Ledger | Auto-computed money trail per project |
| Assignment | You ↔ project link — visibility follows it |
| Eligibility | ACTIVE account + SUPERVISOR role = assignable |
| Audit / Logs | Who did what, when — kept for everything important |
| Draft vs Submitted | Draft = editable; Submitted = locked, approval path required |

---

*This manual is generated from the live system (roles, permissions, lifecycles,
routes and validations). If any screen behaves differently, the screen's own
messages govern — report it to your administrator.*
