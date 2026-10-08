import { describe, it, expect } from 'vitest';
import { can, PERMISSIONS, normalizeRole, isAdminLike } from './permissions';
import { ROLES } from './roles';

describe('roles', () => {
  it('exposes only supported roles (no orphan LAB_ANALYST)', () => {
    expect(ROLES.SUPERADMIN).toBe('SUPERADMIN');
    expect(ROLES.ADMIN).toBe('ADMIN');
    expect(ROLES.SUPERVISOR).toBe('SUPERVISOR');
    expect(Object.values(ROLES)).not.toContain('LAB_ANALYST');
  });
});

describe('normalizeRole', () => {
  it('uppercases and trims', () => {
    expect(normalizeRole('superadmin')).toBe('SUPERADMIN');
    expect(normalizeRole(' Supervisor ')).toBe('SUPERVISOR');
    expect(normalizeRole(null)).toBe('');
  });
});

describe('can() permission gates', () => {
  it('superadmin has all permissions', () => {
    const user = { role: 'SUPERADMIN' };
    Object.values(PERMISSIONS).forEach((p) => expect(can(user, p)).toBe(true));
  });

  it('supervisor cannot manage users or change roles', () => {
    const user = { role: 'SUPERVISOR' };
    expect(can(user, PERMISSIONS.USER_CREATE)).toBe(false);
    expect(can(user, PERMISSIONS.ROLE_CHANGE)).toBe(false);
    expect(can(user, PERMISSIONS.DER_CREATE)).toBe(true);
    expect(can(user, PERMISSIONS.PROJECT_VIEW)).toBe(true);
  });

  it('admin can invite and assign but role check is case-insensitive', () => {
    expect(can({ role: 'admin' }, PERMISSIONS.USER_INVITE)).toBe(true);
    expect(can({ role: 'admin' }, PERMISSIONS.PROJECT_ASSIGN)).toBe(true);
    expect(can({ role: 'admin' }, PERMISSIONS.USER_DELETE)).toBe(false);
  });

  it('unknown role has no permissions', () => {
    expect(can({ role: 'LAB_ANALYST' }, PERMISSIONS.USER_VIEW)).toBe(false);
  });

  it('admin holds explicit procurement and review permissions', () => {
    const admin = { role: 'ADMIN' };
    for (const p of [
      'PROJECT_CREATE', 'PROJECT_UPDATE', 'VENDOR_CREATE', 'VENDOR_UPDATE',
      'RFQ_CREATE', 'RFQ_SEND', 'QUOTATION_REVIEW', 'EVALUATION_CREATE',
      'AWARD_CREATE', 'WORK_ORDER_CREATE', 'WORK_ORDER_ISSUE',
      'DER_REVIEW', 'EXPENDITURE_APPROVE', 'PROJECT_VENDOR_ASSIGN',
    ]) {
      expect(can(admin, PERMISSIONS[p])).toBe(true);
    }
    expect(can(admin, PERMISSIONS.USER_DELETE)).toBe(false);
    expect(can(admin, PERMISSIONS.QUOTATION_SUBMIT)).toBe(false);
    expect(can(admin, PERMISSIONS.WORK_ORDER_ACCEPT)).toBe(false);
  });

  it('vendor is least-privilege portal scoped', () => {
    const vendor = { role: 'VENDOR' };
    for (const p of [
      'PROJECT_VIEW', 'VENDOR_VIEW', 'RFQ_VIEW', 'QUOTATION_SUBMIT',
      'QUOTATION_VIEW', 'WORK_ORDER_VIEW', 'WORK_ORDER_ACCEPT',
    ]) {
      expect(can(vendor, PERMISSIONS[p])).toBe(true);
    }
    for (const p of [
      'USER_CREATE', 'PROJECT_CREATE', 'VENDOR_CREATE', 'RFQ_CREATE',
      'RFQ_SEND', 'QUOTATION_REVIEW', 'EVALUATION_CREATE', 'AWARD_CREATE',
      'WORK_ORDER_ISSUE', 'DER_CREATE', 'EXPENDITURE_CREATE', 'ROLE_CHANGE',
    ]) {
      expect(can(vendor, PERMISSIONS[p])).toBe(false);
    }
  });
});

describe('isAdminLike', () => {
  it('matches superadmin and admin only', () => {
    expect(isAdminLike({ role: 'SUPERADMIN' })).toBe(true);
    expect(isAdminLike({ role: 'ADMIN' })).toBe(true);
    expect(isAdminLike({ role: 'SUPERVISOR' })).toBe(false);
    expect(isAdminLike({ role: 'VENDOR' })).toBe(false);
  });
});
