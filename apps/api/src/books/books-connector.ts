/**
 * Books connector abstraction.
 * External Books target (e.g. Zoho): BLOCKED BY DEC-016.
 * Internal connector records sync state only.
 */
import {pgQuery, withPgTransaction} from '../infrastructure/db/postgres.js';

export interface BooksConnector {
  syncEvent(input: {
    organizationId: string;
    eventType: string;
    eventId?: string | null;
    payload: Record<string, unknown>;
  }): Promise<{status: string; externalId?: string | null}>;
}

export class InternalBooksConnector implements BooksConnector {
  async syncEvent(input: {
    organizationId: string;
    eventType: string;
    eventId?: string | null;
    payload: Record<string, unknown>;
  }) {
    return withPgTransaction(async (client) => {
      const externalId = `internal:${input.eventType}:${input.eventId || Date.now()}`;
      const r = await client.query(
        `INSERT INTO books_sync_state(
           organization_id, event_id, event_type, external_id, status, attempts, payload_json
         ) VALUES ($1,$2,$3,$4,'SYNCED',1,$5) RETURNING *`,
        [
          input.organizationId,
          input.eventId || null,
          input.eventType,
          externalId,
          JSON.stringify(input.payload),
        ],
      );
      return {status: r.rows[0].status as string, externalId};
    });
  }
}

export const booksConnector: BooksConnector = new InternalBooksConnector();

export const booksService = {
  async listSyncState(organizationId: string, limit = 50, offset = 0) {
    const r = await pgQuery(
      `SELECT * FROM books_sync_state WHERE organization_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [organizationId, limit, offset],
    );
    return r.rows;
  },

  async processOutboxLikeEvent(input: {
    organizationId: string;
    eventType: string;
    eventId?: string;
    payload: Record<string, unknown>;
  }) {
    // Zoho / external cutover BLOCKED BY: DEC-016
    return booksConnector.syncEvent(input);
  },
};
