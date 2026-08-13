import crypto from 'node:crypto';
import {pgQuery, withPgTransaction} from '../infrastructure/db/postgres.js';
import {AppError, notFound} from '../foundation/errors.js';
import {writeAuditEvent} from '../foundation/audit.js';
import {resolveMasterId} from './master-data.js';
import {
  buildStorageKey,
  getDocumentDownloadUrl,
  getDocumentObject,
  isDocumentStorageProduction,
  putDocumentObject,
  requiresDocumentFileUpload,
} from '../platform/document-storage.js';

type Actor = {userId: string; requestId?: string};

/** Never expose storage_key to API clients (signed URL / private access only). */
function projectDocument(row: any) {
  if (!row) return row;
  const {storage_key: _omit, ...safe} = row;
  return {...safe, has_file: Boolean(row.sha256 ?? row.has_file)};
}

async function getDocumentRow(client: any, documentId: string, organizationId?: string) {
  const params: unknown[] = [documentId];
  let sql = `SELECT d.*, dt.code AS document_type_code
             FROM documents d
             JOIN master_document_types dt ON dt.id = d.document_type_id
             WHERE d.id=$1`;
  if (organizationId) {
    params.push(organizationId);
    sql += ` AND d.organization_id=$2`;
  }
  const r = await client.query(sql, params);
  return r.rows[0] || null;
}

export const documentsService = {
  async register(
    organizationId: string,
    input: {
      documentTypeCode: string;
      subjectType?: 'ORGANIZATION' | 'BENEFICIAL_OWNER' | 'DIRECTOR' | 'REPRESENTATIVE' | 'PAYOUT_ACCOUNT';
      subjectId?: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      sha256?: string;
      storageKey?: string;
    },
    actor: Actor,
  ) {
    if (requiresDocumentFileUpload() && !input.storageKey) {
      throw new AppError(
        'DOCUMENT_UPLOAD_REQUIRED',
        'Metadata-only document registration is disabled. Use the upload flow (POST /merchant/documents/upload-intent).',
        400,
      );
    }
    return withPgTransaction(async (client) => {
      const documentTypeId = await resolveMasterId('master_document_types', input.documentTypeCode, client);
      const r = await client.query(
        `INSERT INTO documents (
           organization_id, document_type_id, subject_type, subject_id, file_name, mime_type,
           size_bytes, sha256, storage_key, status, uploaded_by_user_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'UPLOADED',$10)
         RETURNING *`,
        [
          organizationId,
          documentTypeId,
          input.subjectType || 'ORGANIZATION',
          input.subjectId || null,
          input.fileName,
          input.mimeType,
          input.sizeBytes,
          input.sha256 || null,
          input.storageKey || null,
          actor.userId,
        ],
      );
      await writeAuditEvent(
        {
          organizationId,
          actorUserId: actor.userId,
          action: 'document.register',
          resourceType: 'documents',
          resourceId: r.rows[0].id,
          requestId: actor.requestId,
          after: {file_name: input.fileName, type: input.documentTypeCode},
        },
        client,
      );
      return projectDocument(r.rows[0]);
    });
  },

  /** P16.3 — create document row and return upload target for binary content. */
  async createUploadIntent(
    organizationId: string,
    input: {
      documentTypeCode: string;
      subjectType?: 'ORGANIZATION' | 'BENEFICIAL_OWNER' | 'DIRECTOR' | 'REPRESENTATIVE' | 'PAYOUT_ACCOUNT';
      subjectId?: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
    },
    actor: Actor,
  ) {
    if (input.sizeBytes <= 0 || input.sizeBytes > 25 * 1024 * 1024) {
      throw new AppError('DOCUMENT_SIZE_INVALID', 'Document size must be between 1 byte and 25MB', 400);
    }
    return withPgTransaction(async (client) => {
      const documentTypeId = await resolveMasterId('master_document_types', input.documentTypeCode, client);
      const documentId = crypto.randomUUID();
      const storageKey = buildStorageKey(organizationId, documentId, input.fileName);
      const r = await client.query(
        `INSERT INTO documents (
           id, organization_id, document_type_id, subject_type, subject_id, file_name, mime_type,
           size_bytes, sha256, storage_key, status, uploaded_by_user_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL,$9,'UPLOADED',$10)
         RETURNING *`,
        [
          documentId,
          organizationId,
          documentTypeId,
          input.subjectType || 'ORGANIZATION',
          input.subjectId || null,
          input.fileName,
          input.mimeType,
          input.sizeBytes,
          storageKey,
          actor.userId,
        ],
      );
      await writeAuditEvent(
        {
          organizationId,
          actorUserId: actor.userId,
          action: 'document.upload_intent',
          resourceType: 'documents',
          resourceId: documentId,
          requestId: actor.requestId,
          after: {file_name: input.fileName, type: input.documentTypeCode},
        },
        client,
      );
      return {
        document: projectDocument(r.rows[0]),
        upload: {
          method: 'PUT',
          path: `/api/v1/merchant/documents/${documentId}/content`,
          max_bytes: input.sizeBytes,
        },
      };
    });
  },

  async uploadContent(organizationId: string, documentId: string, body: Buffer, actor: Actor) {
    return withPgTransaction(async (client) => {
      const row = await getDocumentRow(client, documentId, organizationId);
      if (!row) throw notFound('Document not found', 'DOCUMENT_NOT_FOUND');
      if (!row.storage_key) {
        throw new AppError('DOCUMENT_UPLOAD_NOT_READY', 'Document has no storage key', 409);
      }
      if (row.sha256) {
        throw new AppError('DOCUMENT_ALREADY_UPLOADED', 'Document content was already uploaded', 409);
      }
      const stored = await putDocumentObject(row.storage_key, body, row.mime_type);
      if (stored.sizeBytes > Number(row.size_bytes)) {
        throw new AppError('DOCUMENT_TOO_LARGE', 'Uploaded file exceeds declared size', 400);
      }
      const r = await client.query(
        `UPDATE documents
         SET size_bytes=$2, sha256=$3, updated_at=NOW()
         WHERE id=$1
         RETURNING *`,
        [documentId, stored.sizeBytes, stored.sha256],
      );
      await writeAuditEvent(
        {
          organizationId,
          actorUserId: actor.userId,
          action: 'document.uploaded',
          resourceType: 'documents',
          resourceId: documentId,
          requestId: actor.requestId,
          metadata: {size_bytes: stored.sizeBytes},
        },
        client,
      );
      return projectDocument(r.rows[0]);
    });
  },

  async list(organizationId: string) {
    const r = await pgQuery(
      `SELECT d.id, dt.code AS document_type_code, d.subject_type, d.subject_id, d.file_name, d.mime_type,
              d.size_bytes, d.sha256, d.status, d.rejection_reason, d.reviewed_at, d.created_at,
              (d.sha256 IS NOT NULL) AS has_file
       FROM documents d
       JOIN master_document_types dt ON dt.id = d.document_type_id
       WHERE d.organization_id=$1
       ORDER BY d.created_at DESC`,
      [organizationId],
    );
    return r.rows;
  },

  async listForOrganization(organizationId: string) {
    return this.list(organizationId);
  },

  async getContent(documentId: string, opts: {organizationId?: string; admin?: boolean}) {
    const r = await pgQuery<{storage_key: string; mime_type: string; file_name: string; organization_id: string}>(
      `SELECT storage_key, mime_type, file_name, organization_id FROM documents WHERE id=$1`,
      [documentId],
    );
    const doc = r.rows[0];
    if (!doc?.storage_key) throw notFound('Document file not found', 'DOCUMENT_FILE_NOT_FOUND');
    if (!opts.admin && opts.organizationId && doc.organization_id !== opts.organizationId) {
      throw notFound('Document not found', 'DOCUMENT_NOT_FOUND');
    }
    const signed = await getDocumentDownloadUrl(doc.storage_key);
    if (signed) return {mode: 'redirect' as const, url: signed, mimeType: doc.mime_type, fileName: doc.file_name};
    const buf = await getDocumentObject(doc.storage_key);
    return {mode: 'buffer' as const, buffer: buf, mimeType: doc.mime_type, fileName: doc.file_name};
  },

  async markPendingReviewForOrganization(client: any, organizationId: string) {
    await client.query(
      `UPDATE documents
       SET status='PENDING_REVIEW', updated_at=NOW()
       WHERE organization_id=$1 AND status='UPLOADED' AND storage_key IS NOT NULL AND sha256 IS NOT NULL`,
      [organizationId],
    );
  },

  async archive(organizationId: string, documentId: string, actor: Actor) {
    return withPgTransaction(async (client) => {
      const r = await client.query(
        `UPDATE documents SET status='ARCHIVED', updated_at=NOW()
         WHERE id=$1 AND organization_id=$2 AND status IN ('UPLOADED','REJECTED')
         RETURNING *`,
        [documentId, organizationId],
      );
      if (!r.rows[0]) {
        throw new AppError('DOCUMENT_NOT_ARCHIVABLE', 'Document not found or not in an archivable status', 409);
      }
      await writeAuditEvent(
        {
          organizationId,
          actorUserId: actor.userId,
          action: 'document.archive',
          resourceType: 'documents',
          resourceId: documentId,
          requestId: actor.requestId,
        },
        client,
      );
      return projectDocument(r.rows[0]);
    });
  },

  /** Platform review: ACCEPT / REJECT with reason. */
  async review(documentId: string, decision: 'ACCEPTED' | 'REJECTED', reason: string | null, actor: Actor) {
    return withPgTransaction(async (client) => {
      const before = await client.query(`SELECT * FROM documents WHERE id=$1 FOR UPDATE`, [documentId]);
      if (!before.rows[0]) throw notFound('Document not found', 'DOCUMENT_NOT_FOUND');
      if (!['UPLOADED', 'PENDING_REVIEW'].includes(before.rows[0].status)) {
        throw new AppError('DOCUMENT_ALREADY_REVIEWED', `Document is already ${before.rows[0].status}`, 409);
      }
      if (requiresDocumentFileUpload() && !before.rows[0].storage_key) {
        throw new AppError('DOCUMENT_FILE_MISSING', 'Cannot review a document without uploaded content', 409);
      }
      if (decision === 'REJECTED' && !reason) {
        throw new AppError('REJECTION_REASON_REQUIRED', 'A reason is required to reject a document', 400);
      }
      const r = await client.query(
        `UPDATE documents
         SET status=$2, rejection_reason=$3, reviewed_by_user_id=$4, reviewed_at=NOW(), updated_at=NOW()
         WHERE id=$1
         RETURNING *`,
        [documentId, decision, decision === 'REJECTED' ? reason : null, actor.userId],
      );
      await writeAuditEvent(
        {
          organizationId: before.rows[0].organization_id,
          actorUserId: actor.userId,
          action: 'document.review',
          resourceType: 'documents',
          resourceId: documentId,
          requestId: actor.requestId,
          metadata: {decision, reason},
        },
        client,
      );
      return projectDocument(r.rows[0]);
    });
  },
};
