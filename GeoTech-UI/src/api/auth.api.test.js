import { describe, it, expect } from 'vitest';
import * as api from './auth.api';

describe('user API surface', () => {
  it('exposes auth endpoints', () => {
    expect(typeof api.login).toBe('function');
    expect(typeof api.authLogin).toBe('function');
    expect(typeof api.validateInvitation).toBe('function');
    expect(typeof api.acceptInvite).toBe('function');
  });

  it('exposes user lifecycle endpoints', () => {
    for (const fn of [
      'getUsersAdmin', 'getUserDetail', 'createUser', 'updateUser', 'deleteUser',
      'inviteUser', 'inviteExistingUser', 'resendInvite', 'revokeInvite',
      'changeRole', 'changeStatus', 'getEligibility', 'getUserAudit',
    ]) {
      expect(typeof api[fn], fn).toBe('function');
    }
  });

  it('exposes profile sub-resource endpoints', () => {
    for (const fn of [
      'listExperience', 'addExperience', 'updateExperience', 'deleteExperience',
      'listEducation', 'addEducation', 'deleteEducation',
      'listSkills', 'addSkill', 'deleteSkill',
      'listCertifications', 'addCertification', 'deleteCertification',
      'listLicenses', 'addLicense', 'deleteLicense',
      'listDocuments', 'addDocumentMeta',
      'getSupervisorProfile', 'upsertSupervisorProfile',
    ]) {
      expect(typeof api[fn], fn).toBe('function');
    }
  });

  it('exposes project assignment foundation endpoints', () => {
    for (const fn of [
      'createAssignment', 'listUserAssignments', 'endAssignment', 'listProjectAssignments',
    ]) {
      expect(typeof api[fn], fn).toBe('function');
    }
  });
});
