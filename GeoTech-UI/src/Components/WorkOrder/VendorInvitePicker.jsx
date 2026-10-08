import { useEffect, useMemo, useRef, useState } from "react";
import { FiSearch, FiSend, FiX, FiCheck } from "react-icons/fi";
import { getVendors } from "../../api/vendors.api";
import styles from "./VendorInvitePicker.module.css";

const vendorLabel = (v) =>
  v?.legal_business_name || v?.vendor_company || v?.contact_person || `Vendor #${v?.id}`;

const vendorSub = (v) =>
  [v?.vendor_code, v?.city, v?.email || v?.phone].filter(Boolean).join(" · ");

export default function VendorInvitePicker({ excludeIds = [], busy = false, onSend }) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState([]);
  const [sending, setSending] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    const onDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const q = query.trim();
        const res = await getVendors(q ? { search: q, limit: 20 } : { limit: 20 });
        if (!cancelled) setOptions(res.data || []);
      } catch {
        if (!cancelled) setOptions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, query ? 300 : 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  // Client-side pass: backend search covers name/company/code only,
  // so also match email / phone / city on the loaded page.
  const results = useMemo(() => {
    const excluded = new Set((excludeIds || []).map(Number));
    const picked = new Set(selected.map((s) => s.id));
    const q = query.trim().toLowerCase().replace(/[\s-]+/g, "");
    return (options || [])
      .filter((v) => !excluded.has(Number(v.id)) && !picked.has(v.id))
      .filter((v) => {
        if (!q) return true;
        const hay = [
          v.legal_business_name, v.vendor_company, v.vendor_code,
          v.email, v.phone, v.contact_person, v.city,
        ]
          .filter(Boolean)
          .map((x) => String(x).toLowerCase().replace(/[\s-]+/g, ""));
        return hay.some((h) => h.includes(q));
      })
      .slice(0, 20);
  }, [options, query, excludeIds, selected]);

  const toggle = (v) => {
    setSelected((p) =>
      p.some((s) => s.id === v.id) ? p.filter((s) => s.id !== v.id) : [...p, v]
    );
  };

  const send = async () => {
    if (!selected.length || !onSend) return;
    setSending(true);
    setOpen(false);
    try {
      await onSend(selected.map((s) => s.id));
      setSelected([]);
      setQuery("");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.combo} ref={boxRef}>
        <div className={styles.searchBox}>
          <FiSearch className={styles.searchIcon} />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="Search vendors by name, code, email, phone…"
            aria-label="Search vendors"
          />
          {query && (
            <button type="button" className={styles.clearQ} onClick={() => setQuery("")} aria-label="Clear search">
              <FiX />
            </button>
          )}
          {open && (
            <div className={styles.drop}>
              <div className={styles.dropList}>
                {loading && <div className={styles.dropState}>Searching…</div>}
                {!loading && results.length === 0 && (
                  <div className={styles.dropState}>No vendors match “{query}”.</div>
                )}
                {results.map((v) => (
                  <button key={v.id} type="button" className={styles.opt} onClick={() => toggle(v)}>
                    <span className={styles.optCheck}>
                      {selected.some((s) => s.id === v.id) ? <FiCheck /> : null}
                    </span>
                    <span className={styles.optMain}>
                      <strong>{vendorLabel(v)}</strong>
                      <span>{vendorSub(v) || "—"}</span>
                    </span>
                    <span className={styles.optCode}>#{v.id}</span>
                    <span
                      className={styles.optStatus}
                      data-active={v.status === "ACTIVE" ? "1" : undefined}
                    >
                      {v.status || "—"}
                    </span>
                  </button>
                ))}
              </div>
              <div className={styles.dropFoot}>
                <span>{selected.length} selected</span>
                <button type="button" onClick={() => setOpen(false)}>Done</button>
              </div>
            </div>
          )}
        </div>
        <button
          type="button"
          className={styles.sendBtn}
          disabled={busy || sending || selected.length === 0}
          onClick={send}
        >
          <FiSend /> Send{selected.length > 0 ? ` (${selected.length})` : ""}
        </button>
      </div>

      {selected.length > 0 && (
        <div className={styles.chips}>
          {selected.map((v) => (
            <span key={v.id} className={styles.chip}>
              {v.vendor_code ? `${v.vendor_code} · ` : `Vendor #${v.id} · `}{vendorLabel(v)}
              <button type="button" onClick={() => toggle(v)} aria-label={`Remove ${vendorLabel(v)}`}>
                <FiX />
              </button>
            </span>
          ))}
        </div>
      )}

      {excludeIds?.length > 0 && (
        <span className={styles.hint}>{excludeIds.length} already invited — hidden from results</span>
      )}
    </div>
  );
}
