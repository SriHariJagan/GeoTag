import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import styles from "./Pagination.module.css";

export const totalOf = (res, fallback = 0) => {
  const h = res?.headers?.["x-total-count"];
  const n = Number(h);
  if (Number.isFinite(n) && n >= 0) return n;
  return Array.isArray(res?.data) ? res.data.length : fallback;
};

const pageItems = (page, pages) => {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, 2, page - 1, page, page + 1, pages - 1, pages]);
  const nums = [...set].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out = [];
  let prev = 0;
  for (const n of nums) {
    if (n - prev > 1) out.push("…");
    out.push(n);
    prev = n;
  }
  return out;
};

export default function Pagination({
  page,
  total,
  pageSize,
  onPage,
  onPageSize,
  pageSizeOptions = [10, 20, 50],
}) {
  const pages = Math.max(1, Math.ceil((Number(total) || 0) / pageSize));
  const safePage = Math.min(Math.max(1, page), pages);
  if ((Number(total) || 0) <= Math.min(...pageSizeOptions) && safePage === 1) return null;

  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(total, safePage * pageSize);

  return (
    <div className={styles.bar}>
      <span className={styles.range}>
        Showing <b>{from}–{to}</b> of <b>{total}</b>
      </span>
      <div className={styles.controls}>
        <button
          className={styles.nav}
          disabled={safePage <= 1}
          onClick={() => onPage(safePage - 1)}
          aria-label="Previous page"
        >
          <FiChevronLeft />
        </button>
        {pageItems(safePage, pages).map((n, i) =>
          n === "…" ? (
            <span key={`e${i}`} className={styles.ellipsis}>…</span>
          ) : (
            <button
              key={n}
              className={styles.num}
              data-active={n === safePage ? "1" : undefined}
              onClick={() => onPage(n)}
              aria-label={`Page ${n}`}
              aria-current={n === safePage ? "page" : undefined}
            >
              {n}
            </button>
          )
        )}
        <button
          className={styles.nav}
          disabled={safePage >= pages}
          onClick={() => onPage(safePage + 1)}
          aria-label="Next page"
        >
          <FiChevronRight />
        </button>
      </div>
      {onPageSize && (
        <label className={styles.size}>
          <select
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            aria-label="Rows per page"
          >
            {pageSizeOptions.map((o) => (
              <option key={o} value={o}>{o} / page</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
