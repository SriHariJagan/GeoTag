import { useNavigate } from "react-router-dom";
import { FiArrowLeft } from "react-icons/fi";
import WorkOrderWizard from "../../../Components/WorkOrder/WorkOrderWizard";
import styles from "./Procurement.module.css";

export default function WorkOrderWizardPage() {
  const navigate = useNavigate();
  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>Procurement</span>
          <h1>New Work Order</h1>
          <p>Header → Project → Scope → BOQ → Commercial → Vendors → Terms → Preview → PDF → Sign & Stamp → Send.</p>
        </div>
        <div className={styles.heroActions}>
          <button className={styles.backBtn} onClick={() => navigate("/admin/work-orders")}>
            <FiArrowLeft /> Orders
          </button>
        </div>
      </div>
      <WorkOrderWizard />
    </div>
  );
}
