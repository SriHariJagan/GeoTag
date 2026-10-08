import styles from "./Toast.module.css";

export default function Toast({ toasts = [], onDismiss }) {
  if (!toasts.length) return null;
  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`${styles.toast} ${styles[t.type] || ""}`}>
          <span>{t.message}</span>
          <button type="button" onClick={() => onDismiss?.(t.id)} aria-label="Dismiss">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
