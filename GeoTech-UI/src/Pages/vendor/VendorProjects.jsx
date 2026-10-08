import { useEffect, useState } from "react";
import { FiSearch } from "react-icons/fi";
import { getMyProjects } from "../../api/projects.api";
import styles from "../admin/Procurement/Procurement.module.css";

export default function VendorProjects() {
  const [projects, setProjects] = useState([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyProjects()
      .then((r) => setProjects(r.data || []))
      .catch((err) => setError(err?.response?.data?.detail || "Failed to load projects"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = projects.filter((p) => {
    const q = search.trim().toLowerCase();
    return (
      !q ||
      p.project_code?.toLowerCase().includes(q) ||
      p.name?.toLowerCase().includes(q) ||
      p.client_name?.toLowerCase().includes(q)
    );
  });

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>Vendor Portal</span>
          <h1>My Projects</h1>
          <p>Only projects your organization is assigned to. No competitor data, no budgets.</p>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <FiSearch />
          <input
            placeholder="Search code, name, client..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.contentCard}>
        <div className={styles.tableHeader}>
          <div><h3>Assigned Projects</h3><p>Showing {filtered.length} of {projects.length} project(s)</p></div>
        </div>
        {loading ? (
          <div className={styles.loadingState}><div className={styles.loader}></div><p>Loading…</p></div>
        ) : error ? (
          <div className={styles.emptyState}><h3>Failed to load</h3><p>{error}</p></div>
        ) : filtered.length === 0 ? (
          <div className={styles.emptyState}>
            <h3>{search ? "No matching projects" : "No assigned projects yet"}</h3>
            <p>{search ? "Try a different search." : "Assignments activate after work-order acceptance."}</p>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead><tr><th>Code</th><th>Project</th><th>Client</th><th>Location</th><th>Schedule</th><th>Status</th></tr></thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id}>
                    <td><span className={styles.codeBadge}>{p.project_code}</span></td>
                    <td><strong>{p.name}</strong></td>
                    <td>{p.client_name || "-"}</td>
                    <td>{p.location || "-"}</td>
                    <td>{p.planned_start_date || "?"} → {p.planned_end_date || "?"}</td>
                    <td><span className={`${styles.statusBadge} ${styles.stActive}`}>{(p.status || "-").toLowerCase()}</span></td>
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
