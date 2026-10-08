import React from "react";
import { FiAlertTriangle, FiInfo } from "react-icons/fi";
import Modal from "./Modal";
import styles from "./Modal.module.css";

/**
 * Shared confirmation popup styled like the Projects delete dialog.
 *
 * Props:
 *  - isOpen, onClose, onConfirm
 *  - title, message (React node), confirmLabel
 *  - danger (bool): red confirm + alert icon; otherwise primary + info icon
 *  - size: Modal size (default "sm")
 */
const ConfirmDialog = ({
  isOpen,
  onClose,
  onConfirm,
  title = "Are you sure?",
  message = null,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = true,
  size = "sm",
}) => {
  const Icon = danger ? FiAlertTriangle : FiInfo;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size={size}>
      <div className={styles.confirmWrap}>
        <div
          className={`${styles.confirmIcon} ${
            danger ? styles.confirmIconDanger : styles.confirmIconInfo
          }`}
        >
          <Icon />
        </div>
        <h3 className={styles.confirmTitle}>{title}</h3>
        {message && <p className={styles.confirmText}>{message}</p>}
        <div className={styles.confirmBtns}>
          <button className={styles.btnCancel} onClick={onClose}>
            {cancelLabel}
          </button>
          <button
            className={danger ? styles.btnDanger : styles.btnPrimary}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ConfirmDialog;
