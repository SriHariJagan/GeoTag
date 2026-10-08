import { useState, useEffect } from "react";
import styles from "./Forms.module.css";

const today = new Date().toISOString().split("T")[0];


const EMPTY_FORM = {
  name: "",
  type: "",
  lastMaintenance: today,
  status: "inactive",
  rate: "",
};

export default function MachineryForm({ initialData = null, onSubmit }) {
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  /* ---------------- PREFILL (EDIT MODE) ---------------- */
  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.machine_name || "",
        type: initialData.machine_type || "",
        lastMaintenance: initialData.last_maintenance || "",
        status: initialData.status || "",
        rate: initialData.rate_per_day ?? "",
      });
    } else {
      setFormData(EMPTY_FORM);
    }
    setError("");
  }, [initialData]);

  /* ---------------- CHANGE HANDLER ---------------- */
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError("");
  };

  /* ---------------- SUBMIT ---------------- */
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name.trim() || !formData.type.trim()) {
      setError("Machine name and type are required.");
      return;
    }

    // 🔥 MAP FRONTEND → BACKEND
    const payload = {
      machine_name: formData.name.trim(),
      machine_type: formData.type.trim(),
      last_maintenance: formData.lastMaintenance || null,
      status: formData.status || "inactive", // default
      rate_per_day: formData.rate === "" ? null : Number(formData.rate),
    };
    if (payload.rate_per_day != null && (Number.isNaN(payload.rate_per_day) || payload.rate_per_day < 0)) {
      setError("Rate per day must be a non-negative number.");
      return;
    }

    try {
      setSubmitting(true);
      await onSubmit(payload);
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to save machine.");
    } finally {
      setSubmitting(false);
    }
  };

  /* ================= RENDER ================= */
  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h3>{initialData ? "Edit Machine" : "Add New Machine"}</h3>
      <p className={styles.hint}>
        Register site machinery with its type, last maintenance date and current status.
      </p>

      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor="mf-name">Machine Name *</label>
          <input
            id="mf-name"
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="e.g. Excavator EX-200"
            required
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="mf-type">Machine Type *</label>
          <input
            id="mf-type"
            type="text"
            name="type"
            value={formData.type}
            onChange={handleChange}
            placeholder="Excavator / Crane / Bulldozer"
            required
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="mf-maintenance">Last Maintenance</label>
          <input
            id="mf-maintenance"
            type="date"
            name="lastMaintenance"
            value={formData.lastMaintenance}
            onChange={handleChange}
            max={today}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="mf-rate">Rate per Day (cost ledger)</label>
          <input
            id="mf-rate"
            type="number"
            min="0"
            step="0.01"
            name="rate"
            value={formData.rate}
            onChange={handleChange}
            placeholder="e.g. 5000"
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="mf-status">Status *</label>
          <select
            id="mf-status"
            name="status"
            value={formData.status}
            onChange={handleChange}
            required
          >
            <option value="">Select Status</option>
            <option value="active">Working</option>
            <option value="inactive">Idle</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </div>
      </div>

      {error && <span className={styles.errorMsg}>{error}</span>}

      <button type="submit" className={styles.submitBtn} disabled={submitting}>
        {submitting
          ? "Saving..."
          : initialData
            ? "Update Machine"
            : "Add Machine"}
      </button>
    </form>
  );
}
