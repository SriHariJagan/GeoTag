import { describe, it, expect } from 'vitest';
import * as api from './procurement.api';
import * as projects from './projects.api';
import { can, PERMISSIONS } from '../constants/permissions';

describe('V4 work-order wizard API surface', () => {
  it('exposes wizard/send/PDF/sign/stamp/version endpoints', () => {
    for (const fn of [
      'updateWorkOrder', 'sendWorkOrder', 'listWorkOrderVendors',
      'respondWorkOrder', 'markWorkOrderViewedByVendor', 'reviewWorkOrder',
      'generateWorkOrderPdf', 'workOrderPdfPreviewUrl', 'workOrderPdfDownloadUrl',
      'signWorkOrder', 'stampWorkOrder', 'finalizeWorkOrder',
      'listWorkOrderVersions', 'eligibleVendors', 'listStandardTerms',
      'createStandardTerm', 'previewWoTotals',
    ]) {
      expect(typeof api[fn], fn).toBe('function');
    }
  });

  it('exposes project search/assign/timeline endpoints', () => {
    for (const fn of [
      'searchProjects', 'getProjectDetails', 'assignSupervisor',
      'assignVendor', 'assignMachine', 'getProjectTimeline',
    ]) {
      expect(typeof projects[fn], fn).toBe('function');
    }
  });

  it('computes BOQ preview totals like the backend (authoritative server recompute)', () => {
    const t = api.previewWoTotals(
      [
        { quantity: 500, unit_rate: 1200 },
        { quantity: 1, unit_rate: 50000 },
      ],
      5000, 18000, 2000
    );
    expect(t.subtotal).toBe(650000);
    expect(t.grand).toBe(665000);
    const empty = api.previewWoTotals([], 0, 0, 0);
    expect(empty.grand).toBe(0);
  });

  it('grants sign/stamp/finalize only to admin-like roles', () => {
    const admin = { role: 'ADMIN' };
    const vendor = { role: 'VENDOR' };
    const sup = { role: 'SUPERVISOR' };
    for (const p of ['WORK_ORDER_SIGN', 'WORK_ORDER_STAMP', 'WORK_ORDER_FINALIZE', 'WORK_ORDER_PDF']) {
      expect(can(admin, PERMISSIONS[p])).toBe(true);
      expect(can(vendor, PERMISSIONS[p])).toBe(false);
      expect(can(sup, PERMISSIONS[p])).toBe(false);
    }
  });

  it('builds PDF urls per work order', () => {
    expect(api.workOrderPdfPreviewUrl(7)).toBe('/work-orders/7/pdf/preview');
    expect(api.workOrderPdfDownloadUrl(7)).toBe('/work-orders/7/pdf/download');
  });

  it('exposes corporate document endpoints (V5)', () => {
    for (const fn of [
      'nextWoNumber', 'getWoDocument', 'listWoDocuments', 'uploadWoDocument',
      'verifyWoDocument', 'downloadWoDocumentUrl', 'cloneWoVersion', 'updateWorkOrder',
    ]) {
      expect(typeof api[fn], fn).toBe('function');
    }
    expect(api.downloadWoDocumentUrl(9)).toBe('/work-order-documents/9/download');
  });
});
