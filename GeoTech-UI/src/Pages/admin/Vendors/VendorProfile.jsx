import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  FiArrowLeft, FiEdit2, FiBriefcase,
  FiAward, FiFileText, FiUsers, FiActivity, FiBox, FiClipboard,
  FiCheckCircle, FiClock,
} from "react-icons/fi";
import { useVendors } from "../../../store/context/VendorContext";
import { useAuth } from "../../../store/context/AuthContext";
import { can, PERMISSIONS } from "../../../constants/permissions";
import Modal from "../../../Components/Modal/Modal";
import NewVendorForm from "../../../Components/Forms/NewVendorForm";
import Toast from "../../../Components/Toast/Toast";
import { useToast } from "../../../Components/Toast/useToast";
import * as vendorsAPI from "../../../api/vendors.api";
import { listRFQs, listRFQQuotations } from "../../../api/procurement.api";
import { listWorkOrders, listVendorAssignments } from "../../../api/procurement.api";
import styles from "../../Users/UserProfile.module.css";

const TABS = [
  "Overview", "Contacts", "Capabilities", "Experience", "Equipment",
  "Certifications", "Documents", "RFQs", "Work Orders", "Projects", "Users", "Audit",
];

// Section-data key per tab (API loaders use plural "experiences").
const SECTION_KEY = {
  Contacts: "contacts",
  Capabilities: "capabilities",
  Experience: "experiences",
  Equipment: "equipment",
  Certifications: "certifications",
  Documents: "documents",
};

const fmtDT = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString();
};

export default function VendorProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { fetchVendor, editVendor } = useVendors();
  const { user } = useAuth();
  const { toasts, push, dismiss } = useToast();

  const [vendor, setVendor] = useState(null);
  const [tab, setTab] = useState("Overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [sections, setSections] = useState({});
  const [rfqs, setRfqs] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [wos, setWos] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [users, setUsers] = useState([]);
  const [audit, setAudit] = useState([]);

  const canEdit = can(user, PERMISSIONS.VENDOR_UPDATE);
  const errMsg = (err, fb) => err?.response?.data?.detail || err?.message || fb;

  const loadSection = async (name, fn) => {
    try {
      const res = await fn(id);
      setSections((p) => ({ ...p, [name]: res.data || [] }));
    } catch {
      setSections((p) => ({ ...p, [name]: [] }));
    }
  };

  const reload = async () => {
    try {
      setLoading(true);
      setError("");
      const v = await fetchVendor(id);
      setVendor(v);
      await Promise.all([
        loadSection("contacts", vendorsAPI.listVendorContacts),
        loadSection("capabilities", vendorsAPI.listVendorCapabilities),
        loadSection("experiences", vendorsAPI.listVendorExperiences),
        loadSection("equipment", vendorsAPI.listVendorEquipment),
        loadSection("certifications", vendorsAPI.listVendorCertifications),
        loadSection("documents", vendorsAPI.listVendorDocuments),
      ]);
      const [r, w, a, u, au] = await Promise.all([
        listRFQs().then((x) => x.data).catch(() => []),
        listWorkOrders({ vendor_id: Number(id) }).then((x) => x.data).catch(() => []),
        listVendorAssignments().then((x) => x.data).catch(() => []),
        vendorsAPI.listVendorUsers(id).then((x) => x.data).catch(() => []),
        vendorsAPI.getVendorAudit(id).then((x) => x.data).catch(() => []),
      ]);
      const mine = (r || []).filter((x) => (x.invited_vendors || []).includes(Number(id)));
      setRfqs(mine);
      const qs = [];
      for (const x of mine) {
        const q = await listRFQQuotations(x.id).then((y) => y.data).catch(() => []);
        qs.push(...q.filter((z) => z.vendor_id === Number(id)));
      }
      setQuotes(qs);
      setWos(w || []);
      setAssignments((a || []).filter((x) => x.vendor_id === Number(id)));
      setUsers(u || []);
      setAudit(au || []);
    } catch (err) {
      setError(errMsg(err, "Failed to load vendor profile"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) return <div className={styles.page}><div className={styles.stateCard}><p className={styles.muted}>Loading vendor…</p></div></div>;
  if (error) return <div className={styles.page}><div className={styles.stateCard}><p>{error}</p><button className={styles.back} onClick={() => navigate("/admin/vendors")}><FiArrowLeft /> Vendors</button></div></div>;
  if (!vendor) return null;

  const name = vendor.legal_business_name || vendor.vendor_company || "-";
  const isActive = (vendor.status || "ACTIVE") === "ACTIVE";
  const contactLine = [vendor.contact_person, vendor.phone || vendor.email].filter(Boolean).join(" · ") || "-";
  const locLine = [vendor.city, vendor.country].filter(Boolean).join(", ") || vendor.registered_address || "-";

  const counts = {
    Contacts: (sections.contacts || []).length,
    Capabilities: (sections.capabilities || []).length,
    Experience: (sections.experiences || []).length,
    Equipment: (sections.equipment || []).length,
    Certifications: (sections.certifications || []).length,
    Documents: (sections.documents || []).length,
    RFQs: rfqs.length,
    "Work Orders": wos.length,
    Projects: assignments.length,
    Users: users.length,
    Audit: audit.length,
  };

  const facts = [
    ["Legal Name", vendor.legal_business_name],
    ["Trading Name", vendor.trading_name],
    ["Business Type", vendor.business_type],
    ["Registration No", vendor.registration_number],
    ["Tax ID", vendor.tax_identifier],
    ["Established", vendor.year_established],
    ["Contact Person", vendor.contact_person],
    ["Designation", vendor.contact_designation],
    ["Phone", vendor.phone],
    ["Email", vendor.email],
    ["Registered Address", vendor.registered_address || vendor.address],
    ["Operating Regions", Array.isArray(vendor.operating_regions) ? vendor.operating_regions.join(", ") : vendor.operating_regions],
    ["Service Categories", Array.isArray(vendor.service_categories) ? vendor.service_categories.join(", ") : vendor.service_categories],
    ["Specializations", Array.isArray(vendor.specializations) ? vendor.specializations.join(", ") : vendor.specializations],
    ["Max Project Capacity", vendor.maximum_project_capacity],
    ["Manpower Capacity", vendor.manpower_capacity],
    ["Rating", vendor.rating],
  ];

  return (
    <div className={styles.page}>
      <Toast toasts={toasts} onDismiss={dismiss} />
      <button className={styles.back} onClick={() => navigate("/admin/vendors")}><FiArrowLeft /> Vendors</button>

      <div className={styles.hero}>
        <div className={styles.avatar}>
          {name.charAt(0).toUpperCase()}
          <i className={styles.statusDot} data-active={isActive ? "1" : undefined} title={isActive ? "Active" : "Inactive"} />
        </div>
        <div className={styles.heroMain}>
          <h1>{name}</h1>
          <p>{vendor.vendor_code || "No code"} · {locLine}</p>
          <div className={styles.badges}>
            <span className={styles.badge}>{vendor.status || "-"}</span>
            {vendor.compliance_overdue && (
              <span className={`${styles.badge} ${styles.red}`}>Compliance overdue</span>
            )}
            <span className={styles.badge}><FiBriefcase /> {vendor.years_of_experience ?? "-"} yrs exp</span>
            {vendor.rating != null && <span className={styles.badge}>★ {vendor.rating}</span>}
          </div>
        </div>
        {canEdit && <button className={styles.primary} onClick={() => setEditOpen(true)}><FiEdit2 /> Edit</button>}
      </div>

      <div className={styles.statGrid}>
        <div className={styles.stat} data-tone="blue">
          <span className={styles.statIcon}><FiClipboard /></span>
          <div><span>RFQs</span><strong>{rfqs.length}</strong></div>
        </div>
        <div className={styles.stat} data-tone="violet">
          <span className={styles.statIcon}><FiFileText /></span>
          <div><span>Work orders</span><strong>{wos.length}</strong></div>
        </div>
        <div className={styles.stat} data-tone="green">
          <span className={styles.statIcon}><FiCheckCircle /></span>
          <div><span>Projects</span><strong>{assignments.length}</strong></div>
        </div>
        <div className={styles.stat} data-tone="amber">
          <span className={styles.statIcon}><FiUsers /></span>
          <div><span>Linked users</span><strong>{users.length}</strong></div>
        </div>
      </div>

      <div className={styles.tabs} role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? styles.tabActive : styles.tab}
            onClick={() => setTab(t)}
          >
            {t}
            {counts[t] != null && counts[t] > 0 && <em>{counts[t]}</em>}
          </button>
        ))}
      </div>

      {tab === "Overview" && (
        <div className={styles.card}>
          <h3><FiBriefcase className={styles.headIcon} /> Business Details <em className={styles.count}>{facts.filter(([, v]) => v != null && v !== "").length} fields</em></h3>
          <p className={styles.summary}>
            <b>{contactLine}</b>{vendor.email && vendor.phone ? ` · ${vendor.email}` : ""}
          </p>
          <dl className={styles.grid}>
            {facts.map(([k, v]) => {
              const val = Array.isArray(v) ? v.join(", ") : v;
              const empty = val == null || val === "";
              return (
                <div key={k} className={styles.fact} data-empty={empty ? "1" : undefined}>
                  <dt>{k}</dt>
                  <dd>{empty ? "—" : String(val)}</dd>
                </div>
              );
            })}
          </dl>
        </div>
      )}

      {SECTION_KEY[tab] && (
        <GenericSection
          tab={tab}
          items={sections[SECTION_KEY[tab]] || []}
          canEdit={canEdit}
          onAdd={async (vals) => {
            const api = {
              Contacts: vendorsAPI.addVendorContacts,
              Capabilities: vendorsAPI.addVendorCapabilities,
              Experience: vendorsAPI.addVendorExperiences,
              Equipment: vendorsAPI.addVendorEquipment,
              Certifications: vendorsAPI.addVendorCertifications,
              Documents: vendorsAPI.addVendorDocuments,
            }[tab];
            await api(id, vals);
            push("Added", "success");
            reload();
          }}
          onDelete={async (recId) => {
            const api = {
              Contacts: vendorsAPI.deleteVendorContacts,
              Capabilities: vendorsAPI.deleteVendorCapabilities,
              Experience: vendorsAPI.deleteVendorExperiences,
              Equipment: vendorsAPI.deleteVendorEquipment,
              Certifications: vendorsAPI.deleteVendorCertifications,
              Documents: vendorsAPI.deleteVendorDocuments,
            }[tab];
            await api(id, recId);
            reload();
          }}
          push={push}
        />
      )}

      {tab === "RFQs" && (
        <div className={styles.card}>
          <h3><FiClipboard className={styles.headIcon} /> RFQs sent to this vendor <em className={styles.count}>{rfqs.length}</em></h3>
          {rfqs.length === 0 && <p className={styles.muted}>No RFQs yet.</p>}
          <div className={styles.subGrid}>
            {rfqs.map((r) => (
              <div key={r.id} className={styles.subRow}>
                <div className={styles.subMain}>
                  <b>{r.rfq_number} — {r.title || "Untitled"}</b>
                  <span>Status: {r.status || "-"}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "Work Orders" && (
        <>
          <div className={styles.card}>
            <h3><FiFileText className={styles.headIcon} /> Work orders <em className={styles.count}>{wos.length}</em></h3>
            {wos.length === 0 && <p className={styles.muted}>No work orders.</p>}
            <div className={styles.subGrid}>
              {wos.map((w) => (
                <div key={w.id} className={styles.subRow}>
                  <div className={styles.subMain}>
                    <b>{w.work_order_number || `WO #${w.id}`}</b>
                    <span>{w.status || "-"} · {w.contract_value ?? "-"} {w.currency || ""}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className={styles.card}>
            <h3><FiAward className={styles.headIcon} /> Quotations <em className={styles.count}>{quotes.length}</em></h3>
            {quotes.length === 0 && <p className={styles.muted}>No quotations.</p>}
            <div className={styles.subGrid}>
              {quotes.map((q) => (
                <div key={q.id} className={styles.subRow}>
                  <div className={styles.subMain}>
                    <b>{q.quotation_number || `Quotation #${q.id}`}</b>
                    <span>{q.status || "-"} · {q.total ?? "-"} {q.currency || ""}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {tab === "Projects" && (
        <div className={styles.card}>
          <h3><FiCheckCircle className={styles.headIcon} /> Project assignments <em className={styles.count}>{assignments.length}</em></h3>
          {assignments.length === 0 && <p className={styles.muted}>Not assigned to any project. Assignments activate only after work-order acceptance.</p>}
          <div className={styles.subGrid}>
            {assignments.map((a) => (
              <div key={a.id} className={styles.subRow}>
                <div className={styles.subMain}>
                  <b>Project #{a.project_id}</b>
                  <span>{a.status || "-"} · WO #{a.work_order_id ?? "-"}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "Users" && (
        <div className={styles.card}>
          <h3><FiUsers className={styles.headIcon} /> Linked portal users <em className={styles.count}>{users.length}</em></h3>
          {users.length === 0 && <p className={styles.muted}>No linked users.</p>}
          <div className={styles.subGrid}>
            {users.map((u) => (
              <div key={u.id} className={styles.subRow}>
                <div className={styles.subMain}>
                  <b>User #{u.user_id}</b>
                  <span>{u.org_role || "-"}{u.is_primary ? " · primary" : ""}</span>
                </div>
              </div>
            ))}
          </div>
          {canEdit && <LinkUserForm vendorId={id} onDone={reload} push={push} />}
        </div>
      )}

      {tab === "Audit" && (
        <div className={styles.card}>
          <h3><FiActivity className={styles.headIcon} /> Audit history <em className={styles.count}>{audit.length}</em></h3>
          {audit.length === 0 && <p className={styles.muted}>No audit entries.</p>}
          <div className={styles.timeline}>
            {audit.map((a, i) => (
              <div key={a.id} className={styles.tItem}>
                <span className={styles.tDot} data-alt={i % 2 ? "1" : undefined} />
                <div className={styles.tMain}>
                  <strong>{a.action}</strong>
                  <span>actor #{a.actor_id ?? "-"}</span>
                </div>
                <span className={styles.tTime}><FiClock /> {fmtDT(a.timestamp)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal isOpen={editOpen} onClose={() => setEditOpen(false)}>
        <NewVendorForm
          initialData={vendor}
          onSubmit={async (payload) => {
            await editVendor(vendor.id, payload);
            setEditOpen(false);
            reload();
            push("Vendor updated", "success");
          }}
        />
      </Modal>
    </div>
  );
}

const FIELD_HINTS = {
  Contacts: [["name", "Name *"], ["designation", "Designation"], ["email", "Email"], ["phone", "Phone"]],
  Capabilities: [["category", "Category * (e.g. DRILLING)"], ["description", "Description"]],
  Experience: [["project_name", "Project *"], ["client_name", "Client"], ["location", "Location"]],
  Equipment: [["equipment_type", "Type *"], ["equipment_name", "Name *"], ["quantity", "Qty"], ["condition", "Condition"]],
  Certifications: [["certification_name", "Name *"], ["issuing_organization", "Issuer"], ["expiry_date", "Expiry (YYYY-MM-DD)"]],
  Documents: [["document_type", "Type * (PROFILE|CERTIFICATE|...)"], ["file_name", "File name"]],
};

const SECTION_ICON = {
  Contacts: FiUsers,
  Capabilities: FiBox,
  Experience: FiBriefcase,
  Equipment: FiBox,
  Certifications: FiAward,
  Documents: FiFileText,
};

function GenericSection({ tab, items, canEdit, onAdd, onDelete, push }) {
  const [vals, setVals] = useState({});
  const Icon = SECTION_ICON[tab] || FiBox;
  const render = (x) => {
    if (tab === "Contacts") return (<><b>{x.name}</b><span>{[x.designation, x.email || x.phone].filter(Boolean).join(" · ") || "-"}</span></>);
    if (tab === "Capabilities") return (<><b>{x.category}</b><span>{x.description || "-"}</span></>);
    if (tab === "Experience") return (<><b>{x.project_name}</b><span>{[x.client_name, x.location].filter(Boolean).join(" · ") || "-"}</span></>);
    if (tab === "Equipment") return (<><b>{x.equipment_name} ({x.equipment_type}) × {x.quantity}</b><span>{x.availability_status || x.condition || "-"}</span></>);
    if (tab === "Certifications") return (<><b>{x.certification_name}</b><span>{[x.issuing_organization, x.expiry_date ? `expires ${x.expiry_date}` : null].filter(Boolean).join(" · ") || "-"}</span></>);
    return (<><b>{x.document_type}</b><span>{[x.file_name, x.storage_status].filter(Boolean).join(" · ") || "no file"}</span></>);
  };
  return (
    <div className={styles.card}>
      <h3><Icon className={styles.headIcon} /> {tab} <em className={styles.count}>{items.length}</em></h3>
      {items.length === 0 && <p className={styles.muted}>None recorded.</p>}
      <div className={styles.subGrid}>
        {items.map((x) => (
          <div key={x.id} className={styles.subRow}>
            <div className={styles.subMain}>{render(x)}</div>
            {canEdit && <button className={styles.miniDanger} onClick={async () => { try { await onDelete(x.id); } catch (e) { push(e?.response?.data?.detail || "Delete failed", "error"); } }}>Delete</button>}
          </div>
        ))}
      </div>
      {canEdit && (
        <form
          className={styles.miniForm}
          onSubmit={async (e) => {
            e.preventDefault();
            try { await onAdd(vals); setVals({}); } catch (err) { push(err?.response?.data?.detail || "Add failed", "error"); }
          }}
        >
          {(FIELD_HINTS[tab] || []).map(([name, label]) => (
            <label key={name} className={styles.miniField}>
              <span>{label}</span>
              <input value={vals[name] || ""} onChange={(e) => setVals((p) => ({ ...p, [name]: e.target.value }))} />
            </label>
          ))}
          <button type="submit" className={styles.miniPrimary}>Add</button>
        </form>
      )}
    </div>
  );
}

function LinkUserForm({ vendorId, onDone, push }) {
  const [userId, setUserId] = useState("");
  return (
    <form
      className={styles.miniForm}
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await vendorsAPI.linkVendorUser(vendorId, { user_id: Number(userId) });
          setUserId("");
          onDone();
          push("User linked (must be ACTIVE)", "success");
        } catch (err) {
          push(err?.response?.data?.detail || "Link failed", "error");
        }
      }}
    >
      <label className={styles.miniField}>
        <span>User ID (active account)</span>
        <input placeholder="e.g. 12" value={userId} onChange={(e) => setUserId(e.target.value)} required />
      </label>
      <button type="submit" className={styles.miniPrimary}>Link User</button>
    </form>
  );
}

