import {afterEach, describe, expect, it} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  buildStorageKey,
  documentStorageBackendForTests,
  getDocumentObject,
  isDocumentStorageProduction,
  putDocumentObject,
  requiresDocumentFileUpload,
} from '../apps/api/src/platform/document-storage.js';

describe('P16.3 document storage', () => {
  const root = path.join(process.cwd(), '.tmp', 'doc-storage-test');

  afterEach(async () => {
    delete process.env.DOCUMENT_STORAGE_BACKEND;
    delete process.env.DOCUMENT_STORAGE_PATH;
    delete process.env.NODE_ENV;
    await fs.rm(root, {recursive: true, force: true});
  });

  it('uses local backend by default', () => {
    process.env.DOCUMENT_STORAGE_BACKEND = 'local';
    expect(documentStorageBackendForTests()).toBe('local');
    expect(isDocumentStorageProduction()).toBe(true);
  });

  it('metadata backend disables production storage', () => {
    process.env.DOCUMENT_STORAGE_BACKEND = 'metadata';
    expect(isDocumentStorageProduction()).toBe(false);
    expect(requiresDocumentFileUpload()).toBe(false);
  });

  it('stores and reads local objects', async () => {
    process.env.DOCUMENT_STORAGE_BACKEND = 'local';
    process.env.DOCUMENT_STORAGE_PATH = root;
    const key = buildStorageKey('org-1', 'doc-1', 'cert.pdf');
    const body = Buffer.from('%PDF-1.4 test');
    const stored = await putDocumentObject(key, body, 'application/pdf');
    expect(stored.sha256).toMatch(/^[a-f0-9]{64}$/);
    const read = await getDocumentObject(key);
    expect(read.equals(body)).toBe(true);
  });

  it('requires file upload only in production', () => {
    process.env.DOCUMENT_STORAGE_BACKEND = 'local';
    process.env.NODE_ENV = 'development';
    expect(requiresDocumentFileUpload()).toBe(false);
    process.env.NODE_ENV = 'production';
    expect(requiresDocumentFileUpload()).toBe(true);
  });
});
