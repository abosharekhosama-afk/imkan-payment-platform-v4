import {pgQuery, withPgTransaction} from '../infrastructure/db/postgres.js';
import {AppError, notFound} from '../foundation/errors.js';
import {writeAuditEvent} from '../foundation/audit.js';
import {resolveMasterId} from './master-data.js';

type Actor = {userId: string; requestId?: string};

/** Never expose storage_key to API clients (signed URL / private access only later). */
function projectDocument(row: any) {
  if (!row) return row;
  const {storage_key: _omit, ...safe} = row;
  return safe;
}

/**
 * Document METADATA subsystem. Binary content is never stored in PostgreSQL;
 * storage_key is an opaque reference for a future storage adapter (no storage
 * vendor is invented in Phase 3).
 */
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
        {organizationId, actorUserId: actor.userId, action: 'document.register', resourceType: 'documents', resourceId: r.rows[0].id, requestId: actor.requestId, after: {file_name: input.fileName, type: input.documentTypeCode}},
        client,
      );
      return projectDocument(r.rows[0]);
    });
  },

  async list(organizationId: string) {
    const r = await pgQuery(
      `SELECT d.id, dt.code AS document_type_code, d.subject_type, d.subject_id, d.file_name, d.mime_type,
              d.size_bytes, d.sha256, d.status, d.rejection_reason, d.reviewed_at, d.created_at
       FROM documents d
       JOIN master_document_types dt ON dt.id = d.document_type_id
       WHERE d.organization_id=$1
       ORDER BY d.created_at DESC`,
      [organizationId],
    );
    return r.rows;
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
        {organizationId, actorUserId: actor.userId, action: 'document.archive', resourceType: 'documents', resourceId: documentId, requestId: actor.requestId},
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
        {organizationId: before.rows[0].organization_id, actorUserId: actor.userId, action: 'document.review', resourceType: 'documents', resourceId: documentId, requestId: actor.requestId, metadata: {decision, reason}},
        client,
      );
      return projectDocument(r.rows[0]);
    });
  },
};
