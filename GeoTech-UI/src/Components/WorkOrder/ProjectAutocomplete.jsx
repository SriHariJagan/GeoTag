import { useCallback, useEffect, useRef, useState } from "react";
import { FiChevronDown, FiFolderPlus, FiMapPin, FiSearch } from "react-icons/fi";
import { searchProjects } from "../../api/projects.api";
import { Popover, PopList } from "./Picker";
import styles from "./Studio.module.css";

/**
 * Project search field. The result list renders in a portal so it is never
 * clipped by the editor panel — long result sets scroll properly.
 */
export default function ProjectAutocomplete({ value, onSelect, onReset, placeholder }) {
  const [q, setQ] = useState(value || "");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const anchorRef = useRef(null);
  const timer = useRef(null);

  useEffect(() => { setQ(value || ""); }, [value]);

  const load = useCallback(async (term) => {
    setLoading(true);
    try {
      const res = await searchProjects(term, 50);
      setResults(res.data || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const term = q.trim();
    if (!term) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(() => load(term), 250);
    return () => timer.current && clearTimeout(timer.current);
  }, [q, load]);

  const show = () => {
    setOpen(true);
    if (q.trim() && !results.length) load(q.trim());
  };

  const pick = (p) => {
    setQ(p.project_code);
    setOpen(false);
    onSelect && onSelect(p);
  };

  const createNew = () => {
    setOpen(false);
    onReset ? onReset(q) : onSelect && onSelect(null);
  };

  return (
    <>
      <div className={styles.vPicker}>
        <input
          ref={anchorRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={show}
          onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
          placeholder={placeholder || "Type Project ID, e.g. GEO-2026…"}
          role="combobox"
          aria-expanded={open}
          aria-label="Search existing project"
        />
        <button type="button" className={styles.vToggle} onClick={() => (open ? setOpen(false) : show())} aria-label="Show projects" tabIndex={-1}>
          <FiChevronDown />
        </button>
      </div>

      <Popover anchorRef={anchorRef} open={open && !!q.trim()} onClose={() => setOpen(false)} maxHeight={340}>
        <PopList
          query={q}
          onQuery={setQ}
          placeholder="Search by code, name, client or location…"
          loading={loading}
          empty={results.length === 0 ? "No matching project." : ""}
          footer={
            <button type="button" className={styles.popCreate} onClick={createNew}>
              <FiFolderPlus /> Create new project “{q.trim()}”
            </button>
          }
        >
          {results.map((p) => (
            <button key={p.id} type="button" className={styles.popRow} onClick={() => pick(p)}>
              <span className={styles.popRowMain}>
                <strong>{p.project_code}</strong>
                <em>
                  <FiMapPin /> {p.name}
                  {p.client_name ? ` · ${p.client_name}` : ""}
                  {p.location ? ` · ${p.location}` : ""}
                </em>
              </span>
              <span className={`${styles.popTag} ${styles[`popTag_${(p.status || "").toLowerCase()}`] || ""}`}>
                {p.status}
              </span>
            </button>
          ))}
        </PopList>
      </Popover>
    </>
  );
}