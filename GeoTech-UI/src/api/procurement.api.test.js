import { describe, it, expect } from 'vitest';
import * as api from './procurement.api';

describe('procurement API surface', () => {
  it('exposes RFQ endpoints (pre-award terminology, never "work order")', () => {
    for (const fn of [
      'createRFQ', 'listRFQs', 'getRFQ', 'updateRFQ', 'sendRFQ',
      'closeRFQ', 'cancelRFQ', 'addRFQItem', 'listRFQVendors',
      'markRFQViewed', 'declineRFQ',
    ]) {
      expect(typeof api[fn], fn).toBe('function');
    }
  });

  it('exposes quotation / evaluation / award endpoints', () => {
    for (const fn of [
      'submitQuotation', 'listRFQQuotations', 'getQuotation',
      'compareQuotations', 'addQuotationDocument', 'evaluateQuotation',
      'awardQuotation', 'getAward',
    ]) {
      expect(typeof api[fn], fn).toBe('function');
    }
  });

  it('exposes work-order lifecycle + read-only assignments', () => {
    for (const fn of [
      'createWorkOrder', 'listWorkOrders', 'getWorkOrder', 'issueWorkOrder',
      'viewedWorkOrder', 'acceptWorkOrder', 'rejectWorkOrder',
      'progressWorkOrder', 'completeWorkOrder', 'closeWorkOrder',
      'cancelWorkOrder', 'listVendorAssignments', 'endVendorAssignment',
    ]) {
      expect(typeof api[fn], fn).toBe('function');
    }
  });
});
