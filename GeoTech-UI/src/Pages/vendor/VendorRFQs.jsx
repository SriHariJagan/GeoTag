import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiClipboard, FiSearch, FiX } from "react-icons/fi";
import { listRFQs } from "../../api/procurement.api";
import styles from "../admin/Procurement/Procurement.module.css";

export default function VendorRFQs() {
  const navigate = useNavigate();
  const [rfqs, setRfqs] = useState([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listRFQs()
      .then((r) => setRfqs(r.data || []))
      .catch((err) => setError(err?.response?.data?.detail || "Failed to load RFQs"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = rfqs.filter((r) => {
    const q = search.trim().toLowerCase();
    return (
      !q ||
      r.rfq_number?.toLowerCase().includes(q) ||
      r.title?.toLowerCase().includes(q)
    );
  });

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>Vendor Portal</span>
          <h1>RFQs Sent to Us</h1>
          <p>Requests your organization was invited to. Competitor activity is never shown.</p>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <FiSearch />
          <input
            placeholder="Search RFQ number or title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.contentCard}>
        <div className={styles.tableHeader}>
          <div><h3>Request List</h3><p>Showing {filtered.length} of {rfqs.length} RFQ(s)</p></div>
        </div>
        {loading ? (
          <div className={styles.loadingState}><div className={styles.loader}></div><p>Loading…</p></div>
        ) : error ? (
          <div className={styles.emptyState}><FiX /><h3>Failed to load</h3><p>{error}</p></div>
        ) : filtered.length === 0 ? (
          <div className={styles.emptyState}><FiClipboard /><h3>No RFQs found</h3><p>{search ? "Try a different search." : "Nothing has been sent to your organization yet."}</p></div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead><tr><th>RFQ Number</th><th>Title</th><th>Deadline</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td><span className={styles.codeBadge}>{r.rfq_number}</span></td>
                    <td><strong>{r.title}</strong></td>
                    <td>{r.submission_deadline ? new Date(r.submission_deadline).toLocaleDateString() : "-"}</td>
                    <td><span className={`${styles.statusBadge} ${styles.stActive}`}>{(r.status || "-").toLowerCase()}</span></td>
                    <td><button className={styles.rowBtn} onClick={() => navigate(`/vendor/rfqs/${r.id}`)}>Open</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
