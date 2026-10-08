import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiChevronDown, FiSearch } from "react-icons/fi";
import styles from "./Studio.module.css";

/**
 * Anchored dropdown rendered in a portal so long lists always scroll
 * (never clipped by the editor panel or a collapsed section).
 */
export function Popover({ anchorRef, open, onClose, children, width, maxHeight = 320 }) {
  const panelRef = useRef(null);
  const [rect, setRect] = useState(null);

  const place = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    const flip = below < 260 && r.top > below;
    setRect({
      left: r.left,
      width: width ?? r.width,
      top: flip ? undefined : r.bottom + 6,
      bottom: flip ? window.innerHeight - r.top + 6 : undefined,
      maxHeight: Math.max(180, Math.min(maxHeight, flip ? r.top - 16 : below - 16)),
    });
  }, [anchorRef, width, maxHeight]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onMove = () => place();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      const a = anchorRef.current;
      if (a && a.contains(e.target)) return;
      if (panelRef.current && panelRef.current.contains(e.target)) return;
      onClose();
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open || !rect) return null;

  return createPortal(
    <div
      ref={panelRef}
      className={styles.pop}
      style={{
        left: rect.left,
        width: rect.width,
        top: rect.top,
        bottom: rect.bottom,
        maxHeight: rect.maxHeight,
      }}
    >
      {children}
    </div>,
    document.body
  );
}

/** Search box + scrollable result list, with an optional footer slot. */
export function PopList({ query, onQuery, placeholder, loading, empty, children, footer }) {
  return (
    <>
      <div className={styles.popSearch}>
        <FiSearch />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          autoFocus
        />
        {query && (
          <button type="button" onClick={() => onQuery("")} title="Clear" aria-label="Clear search">
            ✕
          </button>
        )}
      </div>
      <div className={styles.popScroll}>
        {loading && <div className={styles.popEmpty}>Loading…</div>}
        {!loading && empty && <div className={styles.popEmpty}>{empty}</div>}
        {!loading && children}
      </div>
      {footer && <div className={styles.popFoot}>{footer}</div>}
    </>
  );
}

export function PopRow({ selected, onClick, title, meta, right, tone }) {
  return (
    <button
      type="button"
      className={`${styles.popRow} ${selected ? styles.popRowOn : ""} ${tone ? styles[tone] || "" : ""}`}
      onClick={onClick}
    >
      <span className={styles.popRowMain}>
        <strong>{title}</strong>
        {meta && <em>{meta}</em>}
      </span>
      {right && <span className={styles.popRowRight}>{right}</span>}
    </button>
  );
}

export function PopFootBtn({ onClick, children, tone }) {
  return (
    <button type="button" className={`${styles.popFootBtn} ${tone ? styles[tone] || "" : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}

export { FiChevronDown };