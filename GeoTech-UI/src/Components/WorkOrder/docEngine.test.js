import { describe, it, expect } from 'vitest';
import { buildBlocks, packBlocks, totalsOf, validateDoc, BLOCKS, PAGE_CAP } from './docEngine';

const doc = (over = {}) => ({
  items: [{ description: 'a', quantity: 2, unit_rate: 100 }],
  payment_terms_list: ['p1'],
  general_terms: ['g1'],
  subject: 's',
  scope_of_work: 'scope',
  signer_name: 'Admin',
  vendor_id: 4,
  project_id: 1,
  work_order_number: 'WO-1',
  work_order_date: '2026-01-01',
  ...over,
});

describe('docEngine', () => {
  it('builds blocks in corporate order', () => {
    const types = buildBlocks(doc()).map((b) => b.type);
    expect(types[0]).toBe(BLOCKS.HEADER);
    expect(types).toContain(BLOCKS.BOQ_HEAD);
    expect(types).toContain(BLOCKS.ROW);
    expect(types).toContain(BLOCKS.TOTALS);
    expect(types[types.length - 1]).toBe(BLOCKS.SIG);
    const boq = types.indexOf(BLOCKS.BOQ_HEAD);
    const row = types.indexOf(BLOCKS.ROW);
    const tot = types.indexOf(BLOCKS.TOTALS);
    expect(boq < row && row < tot).toBe(true);
  });

  it('packs rows across pages and repeats the BOQ header', () => {
    const d = doc({ items: Array.from({ length: 40 }, (_, i) => ({ description: `i${i}`, quantity: 1, unit_rate: 10 })) });
    const blocks = buildBlocks(d);
    const heights = blocks.map((b) => (b.type === BLOCKS.ROW ? 40 : 60));
    const { pages } = packBlocks(blocks, heights, 400);
    expect(pages.length).toBeGreaterThan(1);
    // every page after the first that opens with rows repeats the header
    pages.slice(1).forEach((p) => {
      const first = blocks[p[0]];
      if (first.type === BLOCKS.ROW) expect(p.repeatHead).toBe(true);
    });
    // no page overflows
    const headH = 60;
    pages.forEach((p, pi) => {
      let used = p.repeatHead && pi > 0 ? headH : 0;
      p.forEach((i) => { used += heights[i]; });
      expect(used).toBeLessThanOrEqual(400 + 1);
    });
  });

  it('computes totals like the backend', () => {
    expect(totalsOf([{ quantity: 500, unit_rate: 1200 }, { quantity: 1, unit_rate: 50000 }], 5000, 18000, 2000))
      .toEqual({ subtotal: 650000, grand: 665000 });
  });

  it('validates finalization checklist per section', () => {
    expect(validateDoc(doc())).toEqual([]);
    const missing = validateDoc(doc({ subject: '', payment_terms_list: [], vendor_id: null }));
    const fields = missing.map((m) => m.field);
    expect(fields).toContain('Subject');
    expect(fields).toContain('Payment Terms');
    expect(fields).toContain('Vendor');
  });

  it('PAGE_CAP matches A4 geometry', () => {
    expect(PAGE_CAP).toBe(1123 - 34 - 47);
  });
});
