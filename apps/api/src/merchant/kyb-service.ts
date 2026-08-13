import {pgQuery, withPgTransaction, type PgClient} from '../infrastructure/db/postgres.js';
import {AppError, conflict, notFound} from '../foundation/errors.js';
import {emitOutboxEvent, writeAuditEvent, writeSecurityEvent} from '../foundation/audit.js';
import {kybVerificationProvider} from './verification-providers.js';
import {documentsService} from './documents-service.js';
import {requiresDocumentFileUpload} from '../platform/document-storage.js';
import {kybMerchantPortalUrl, resolveOrganizationNotifyEmail} from './kyb-notify.js';

type Actor = {userId: string; requestId?: string};

export type KybStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'NEEDS_INFORMATION'
  | 'APPROVED'
  | 'REJECTED'
  | 'SUSPENDED';

/** Allowed state machine transitions (spec §6). */
const TRANSITIONS: Record<KybStatus, KybStatus[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['UNDER_REVIEW'],
  UNDER_REVIEW: ['NEEDS_INFORMATION', 'APPROVED', 'REJECTED'],
  NEEDS_INFORMATION: ['SUBMITTED'],
  APPROVED: ['SUSPENDED', 'UNDER_REVIEW'],
  REJECTED: [],
  SUSPENDED: ['UNDER_REVIEW'],
};

function uiStatus(caseStatus: KybStatus, complete: boolean): string {
  switch (caseStatus) {
    case 'DRAFT':
      return complete ? 'pending' : 'incomplete';
    case 'SUBMITTED':
      return 'pending';
    case 'UNDER_REVIEW':
      return 'under_review';
    case 'NEEDS_INFORMATION':
      return 'verification_required';
    case 'APPROVED':
      return 'approved';
    case 'REJECTED':
      return 'rejected';
    case 'SUSPENDED':
      return 'suspended';
  }
}

async function recordTransition(
  client: PgClient,
  input: {
    caseId: string;
    organizationId: string;
    fromStatus: string | null;
    toStatus: string;
    actorUserId?: string | null;
    actorType: 'MERCHANT' | 'PLATFORM' | 'SYSTEM';
    reason?: string | null;
  },
) {
  await client.query(
    `INSERT INTO verification_case_transitions (case_id, organization_id, from_status, to_status, actor_user_id, actor_type, reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [input.caseId, input.organizationId, input.fromStatus, input.toStatus, input.actorUserId || null, input.actorType, input.reason || null],
  );
}

/**
 * Concurrency-safe transition: guarded by current status + version.
 * Throws 409 when another actor already moved the case.
 */
async function transitionCase(
  client: PgClient,
  kase: {id: string; organization_id: string; status: KybStatus; version: number},
  toStatus: KybStatus,
  actor: {userId?: string | null; type: 'MERCHANT' | 'PLATFORM' | 'SYSTEM'},
  reason?: string,
  extraSets: string[] = [],
  extraParams: unknown[] = [],
) {
  if (!TRANSITIONS[kase.status].includes(toStatus)) {
    throw conflict(`Invalid KYB transition ${kase.status} → ${toStatus}`, 'KYB_INVALID_TRANSITION');
  }
  const params: unknown[] = [kase.id, kase.status, kase.version, toStatus, ...extraParams];
  const r = await client.query(
    `UPDATE verification_cases
     SET status=$4, version=version+1, updated_at=NOW()${extraSets.length ? ', ' + extraSets.join(', ') : ''}
     WHERE id=$1 AND status=$2 AND version=$3
     RETURNING *`,
    params,
  );
  if (!r.rows[0]) {
    throw conflict('KYB case was modified concurrently', 'KYB_CONCURRENT_MODIFICATION');
  }
  await recordTransition(client, {
    caseId: kase.id,
    organizationId: kase.organization_id,
    fromStatus: kase.status,
    toStatus,
    actorUserId: actor.userId,
    actorType: actor.type,
    reason: reason || null,
  });
  return r.rows[0];
}

async function getOrCreateCase(client: PgClient, organizationId: string) {
  const existing = await client.query(
    `SELECT * FROM verification_cases
     WHERE organization_id=$1 AND case_type='KYB' AND status <> 'REJECTED'
     FOR UPDATE`,
    [organizationId],
  );
  if (existing.rows[0]) return existing.rows[0];
  const created = await client.query(
    `INSERT INTO verification_cases (organization_id, case_type, subject_type, subject_id, status)
     VALUES ($1, 'KYB', 'ORGANIZATION', $1, 'DRAFT')
     RETURNING *`,
    [organizationId],
  );
  await recordTransition(client, {
    caseId: created.rows[0].id,
    organizationId,
    fromStatus: null,
    toStatus: 'DRAFT',
    actorType: 'SYSTEM',
    reason: 'Case created',
  });
  return created.rows[0];
}

/**
 * Requirement selection: active requirements whose selectors are NULL (global)
 * or match the merchant's country / legal entity type / business type /
 * industry / case risk category. Data-driven — NOT a hardcoded universal rule.
 */
async function applicableRequirements(client: PgClient, organizationId: string, caseRiskCategoryId: string | null) {
  const r = await client.query(
    `SELECT kr.*
     FROM kyb_requirements kr
     LEFT JOIN company_legal_profiles clp ON clp.organization_id = $1
     LEFT JOIN business_profiles bp ON bp.organization_id = $1
     WHERE kr.is_active = TRUE
       AND (kr.country_id IS NULL OR kr.country_id = clp.incorporation_country_id)
       AND (kr.legal_entity_type_id IS NULL OR kr.legal_entity_type_id = clp.legal_entity_type_id)
       AND (kr.business_type_id IS NULL OR kr.business_type_id = bp.business_type_id)
       AND (kr.industry_id IS NULL OR kr.industry_id = bp.industry_id)
       AND (kr.risk_category_id IS NULL OR kr.risk_category_id = $2)
     ORDER BY kr.code`,
    [organizationId, caseRiskCategoryId],
  );
  return r.rows as Array<{
    id: string;
    code: string;
    requirement_type: string;
    params_json: Record<string, unknown>;
  }>;
}

type RequirementStatus = {
  code: string;
  requirement_type: string;
  satisfied: boolean;
  detail: string;
};

async function evaluateRequirements(
  client: PgClient,
  organizationId: string,
  requirements: Array<{code: string; requirement_type: string; params_json: any}>,
): Promise<RequirementStatus[]> {
  const out: RequirementStatus[] = [];
  for (const req of requirements) {
    const params = req.params_json || {};
    let satisfied = false;
    let detail = '';
    switch (req.requirement_type) {
      case 'LEGAL_PROFILE': {
        const r = await client.query(
          `SELECT legal_name, registration_number, legal_entity_type_id, incorporation_country_id
           FROM company_legal_profiles WHERE organization_id=$1`,
          [organizationId],
        );
        const row = r.rows[0];
        satisfied = Boolean(row?.legal_name && row?.registration_number && row?.legal_entity_type_id && row?.incorporation_country_id);
        detail = satisfied ? 'Legal profile complete' : 'Legal name, registration number, entity type and incorporation country are required';
        break;
      }
      case 'BUSINESS_PROFILE': {
        const r = await client.query(
          `SELECT industry_id, business_type_id, description FROM business_profiles WHERE organization_id=$1`,
          [organizationId],
        );
        const row = r.rows[0];
        satisfied = Boolean(row?.industry_id && row?.business_type_id && row?.description);
        detail = satisfied ? 'Business profile complete' : 'Industry, business type and description are required';
        break;
      }
      case 'ADDRESS': {
        const typeCode = String(params.address_type_code || 'REGISTERED');
        const r = await client.query(
          `SELECT ca.id FROM company_addresses ca
           JOIN master_address_types at ON at.id = ca.address_type_id
           WHERE ca.organization_id=$1 AND at.code=$2`,
          [organizationId, typeCode],
        );
        satisfied = Boolean(r.rows[0]);
        detail = satisfied ? `${typeCode} address present` : `${typeCode} address is required`;
        break;
      }
      case 'PERSON_MIN': {
        const min = Number(params.min_total || 1);
        const r = await client.query<{c: number}>(
          `SELECT (
             (SELECT COUNT(*) FROM beneficial_owners WHERE organization_id=$1 AND status='ACTIVE') +
             (SELECT COUNT(*) FROM directors WHERE organization_id=$1 AND status='ACTIVE') +
             (SELECT COUNT(*) FROM authorized_representatives WHERE organization_id=$1 AND status='ACTIVE')
           )::int AS c`,
          [organizationId],
        );
        satisfied = r.rows[0].c >= min;
        detail = satisfied ? `${r.rows[0].c} person(s) recorded` : `At least ${min} owner/director/representative required`;
        break;
      }
      case 'OWNERSHIP_TOTAL_MAX': {
        const max = Number(params.max_percent || 100);
        const r = await client.query<{total: string | null}>(
          `SELECT SUM(ownership_percent) AS total FROM beneficial_owners WHERE organization_id=$1 AND status='ACTIVE'`,
          [organizationId],
        );
        const total = Number(r.rows[0]?.total || 0);
        satisfied = total <= max;
        detail = satisfied ? `Total ownership ${total}%` : `Total ownership ${total}% exceeds ${max}%`;
        break;
      }
      case 'DOCUMENT_TYPE': {
        const docCode = String(params.document_type_code || '');
        const storageClause = requiresDocumentFileUpload()
          ? ` AND d.storage_key IS NOT NULL AND d.sha256 IS NOT NULL`
          : '';
        const r = await client.query(
          `SELECT d.id FROM documents d
           JOIN master_document_types dt ON dt.id = d.document_type_id
           WHERE d.organization_id=$1 AND dt.code=$2 AND d.status IN ('UPLOADED','PENDING_REVIEW','ACCEPTED')${storageClause}`,
          [organizationId, docCode],
        );
        satisfied = Boolean(r.rows[0]);
        detail = satisfied
          ? `Document ${docCode} present`
          : requiresDocumentFileUpload()
            ? `Document ${docCode} must be uploaded with file content`
            : `Document ${docCode} is required`;
        break;
      }
      case 'BANK_ACCOUNT': {
        const r = await client.query(
          `SELECT id FROM payout_accounts WHERE organization_id=$1 AND status IN ('PENDING_VERIFICATION','VERIFIED','ACTIVE')`,
          [organizationId],
        );
        satisfied = Boolean(r.rows[0]);
        detail = satisfied ? 'Payout account present' : 'A payout account is required';
        break;
      }
      default:
        satisfied = false;
        detail = `Unknown requirement type ${req.requirement_type}`;
    }
    out.push({code: req.code, requirement_type: req.requirement_type, satisfied, detail});
  }
  return out;
}

async function appendResult(
  client: PgClient,
  input: {
    caseId: string;
    organizationId: string;
    checkType: string;
    result: 'PASS' | 'FAIL' | 'WARN' | 'PENDING' | 'NOT_AVAILABLE';
    provider?: string;
    reviewerUserId?: string | null;
    details?: unknown;
  },
) {
  await client.query(
    `INSERT INTO verification_results (case_id, organization_id, check_type, result, provider, reviewer_user_id, details_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      input.caseId,
      input.organizationId,
      input.checkType,
      input.result,
      input.provider || 'internal',
      input.reviewerUserId || null,
      input.details ?? null,
    ],
  );
}

/**
 * Called (inside the caller's transaction) when merchant data changes after
 * approval: the case returns to UNDER_REVIEW for re-verification.
 */
export async function flagDataChangedAfterApproval(
  client: PgClient,
  caseId: string,
  organizationId: string,
  actorUserId: string,
) {
  const r = await client.query(`SELECT * FROM verification_cases WHERE id=$1 FOR UPDATE`, [caseId]);
  const kase = r.rows[0];
  if (!kase || kase.status !== 'APPROVED') return;
  await transitionCase(
    client,
    kase,
    'UNDER_REVIEW',
    {userId: actorUserId, type: 'MERCHANT'},
    'Merchant data changed after approval — re-verification required',
  );
  await appendResult(client, {
    caseId,
    organizationId,
    checkType: 'DATA_CHANGED_AFTER_APPROVAL',
    result: 'WARN',
    details: {actor_user_id: actorUserId},
  });
  await writeSecurityEvent(
    {organizationId, userId: actorUserId, eventType: 'kyb.data_changed_after_approval', metadata: {case_id: caseId}},
    client,
  );
  await emitOutboxEvent(
    {organizationId, eventType: 'kyb.case.reopened', aggregateType: 'verification_case', aggregateId: caseId, payload: {reason: 'DATA_CHANGED_AFTER_APPROVAL'}},
    client,
  );
}

export const kybService = {
  /** Merchant view: case + UI status + requirement checklist + documents + history. */
  async getCaseOverview(organizationId: string) {
    return withPgTransaction(async (client) => {
      const kase = await getOrCreateCase(client, organizationId);
      const requirements = await applicableRequirements(client, organizationId, kase.risk_category_id);
      const checklist = await evaluateRequirements(client, organizationId, requirements);
      const complete = checklist.every((c) => c.satisfied);
      const [results, transitions, documents] = await Promise.all([
        client.query(
          `SELECT id, check_type, result, provider, created_at FROM verification_results WHERE case_id=$1 ORDER BY created_at DESC LIMIT 50`,
          [kase.id],
        ),
        client.query(
          `SELECT from_status, to_status, actor_type, reason, created_at FROM verification_case_transitions WHERE case_id=$1 ORDER BY created_at`,
          [kase.id],
        ),
        client.query(
          `SELECT d.id, dt.code AS document_type_code, d.file_name, d.status, d.rejection_reason, d.created_at,
                  (d.sha256 IS NOT NULL) AS has_file
           FROM documents d JOIN master_document_types dt ON dt.id=d.document_type_id
           WHERE d.organization_id=$1 AND d.status <> 'ARCHIVED'
           ORDER BY d.created_at DESC`,
          [organizationId],
        ),
      ]);
      return {
        case: {
          id: kase.id,
          status: kase.status,
          risk_category_id: kase.risk_category_id,
          submitted_at: kase.submitted_at,
          decided_at: kase.decided_at,
          decision_reason: kase.decision_reason,
          version: kase.version,
        },
        onboarding_status: uiStatus(kase.status, complete),
        requirements: checklist,
        missing: checklist.filter((c) => !c.satisfied),
        recent_results: results.rows,
        history: transitions.rows,
        documents: documents.rows,
      };
    });
  },

  /** Merchant submits (DRAFT or NEEDS_INFORMATION → SUBMITTED) after completeness validation. */
  async submit(organizationId: string, actor: Actor) {
    return withPgTransaction(async (client) => {
      const kase = await getOrCreateCase(client, organizationId);
      if (!['DRAFT', 'NEEDS_INFORMATION'].includes(kase.status)) {
        throw conflict(`KYB case cannot be submitted from status ${kase.status}`, 'KYB_INVALID_TRANSITION');
      }
      const requirements = await applicableRequirements(client, organizationId, kase.risk_category_id);
      const checklist = await evaluateRequirements(client, organizationId, requirements);
      const missing = checklist.filter((c) => !c.satisfied);
      if (missing.length) {
        throw new AppError('KYB_INCOMPLETE', 'KYB submission blocked by missing requirements', 422, {missing});
      }

      const updated = await transitionCase(
        client,
        kase,
        'SUBMITTED',
        {userId: actor.userId, type: 'MERCHANT'},
        'Merchant submitted KYB case',
        ['submitted_at=NOW()'],
      );

      // Internal verification checks (spec §6) — append-only results.
      for (const item of checklist) {
        await appendResult(client, {
          caseId: kase.id,
          organizationId,
          checkType: `REQUIREMENT_${item.requirement_type}`,
          result: 'PASS',
          details: {code: item.code, detail: item.detail},
        });
      }

      // Duplicate detection: same registration number in another organization.
      const dup = await client.query<{c: number}>(
        `SELECT COUNT(*)::int AS c
         FROM company_legal_profiles other
         JOIN company_legal_profiles mine ON mine.organization_id=$1
         WHERE other.organization_id <> $1
           AND other.registration_number IS NOT NULL
           AND other.registration_number = mine.registration_number`,
        [organizationId],
      );
      await appendResult(client, {
        caseId: kase.id,
        organizationId,
        checkType: 'DUPLICATE_REGISTRATION_NUMBER',
        result: dup.rows[0].c > 0 ? 'WARN' : 'PASS',
        details: {duplicates: dup.rows[0].c},
      });

      // External provider adapters (stubs — no invented provider API).
      const legal = await client.query(
        `SELECT clp.legal_name, clp.registration_number, c.code AS country_code
         FROM company_legal_profiles clp
         LEFT JOIN master_countries c ON c.id = clp.incorporation_country_id
         WHERE clp.organization_id=$1`,
        [organizationId],
      );
      const companyCheck = await kybVerificationProvider.verifyCompany({
        organizationId,
        legalName: legal.rows[0]?.legal_name || '',
        registrationNumber: legal.rows[0]?.registration_number,
        countryCode: legal.rows[0]?.country_code,
      });
      await appendResult(client, {
        caseId: kase.id,
        organizationId,
        checkType: companyCheck.checkType,
        result: companyCheck.result,
        provider: companyCheck.provider,
        details: companyCheck.details,
      });

      await writeAuditEvent(
        {organizationId, actorUserId: actor.userId, action: 'kyb.case.submit', resourceType: 'verification_cases', resourceId: kase.id, requestId: actor.requestId},
        client,
      );
      await writeSecurityEvent(
        {organizationId, userId: actor.userId, eventType: 'kyb.case.submitted', metadata: {case_id: kase.id}},
        client,
      );
      await documentsService.markPendingReviewForOrganization(client, organizationId);
      const notifyEmail = await resolveOrganizationNotifyEmail(organizationId);
      await emitOutboxEvent(
        {
          organizationId,
          eventType: 'kyb.case.submitted',
          aggregateType: 'verification_case',
          aggregateId: kase.id,
          payload: {
            organization_id: organizationId,
            case_id: kase.id,
            notify_email: notifyEmail,
            portal_url: kybMerchantPortalUrl(),
          },
          idempotencyKey: `kyb-submit-${kase.id}-v${kase.version}`,
        },
        client,
      );
      return updated;
    });
  },

  // ------------------------------------------------------------ platform side

  async listCases(filter: {status?: string; limit: number; offset: number}) {
    const params: unknown[] = [];
    let where = `WHERE vc.case_type='KYB'`;
    if (filter.status) {
      params.push(filter.status);
      where += ` AND vc.status=$${params.length}`;
    }
    params.push(filter.limit, filter.offset);
    const r = await pgQuery(
      `SELECT vc.id, vc.organization_id, o.name AS organization_name, vc.status, vc.risk_category_id,
              vc.submitted_at, vc.decided_at, vc.created_at, vc.updated_at
       FROM verification_cases vc
       JOIN organizations o ON o.id = vc.organization_id
       ${where}
       ORDER BY vc.updated_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return r.rows;
  },

  async getCaseDetail(caseId: string) {
    const kase = await pgQuery(`SELECT * FROM verification_cases WHERE id=$1 AND case_type='KYB'`, [caseId]);
    if (!kase.rows[0]) throw notFound('KYB case not found', 'KYB_CASE_NOT_FOUND');
    const orgId = kase.rows[0].organization_id as string;
    const [results, transitions, documents, org, legal, business, checklist] = await Promise.all([
      pgQuery(`SELECT * FROM verification_results WHERE case_id=$1 ORDER BY created_at DESC`, [caseId]),
      pgQuery(`SELECT * FROM verification_case_transitions WHERE case_id=$1 ORDER BY created_at`, [caseId]),
      documentsService.listForOrganization(orgId),
      pgQuery(`SELECT id, name, country_code, created_at FROM organizations WHERE id=$1`, [orgId]),
      pgQuery(
        `SELECT clp.legal_name, clp.registration_number, met.code AS legal_entity_type_code,
                mc.code AS incorporation_country_code
         FROM company_legal_profiles clp
         LEFT JOIN master_legal_entity_types met ON met.id = clp.legal_entity_type_id
         LEFT JOIN master_countries mc ON mc.id = clp.incorporation_country_id
         WHERE clp.organization_id=$1`,
        [orgId],
      ),
      pgQuery(
        `SELECT bp.description, mi.code AS industry_code, mbt.code AS business_type_code
         FROM business_profiles bp
         LEFT JOIN master_industries mi ON mi.id = bp.industry_id
         LEFT JOIN master_business_types mbt ON mbt.id = bp.business_type_id
         WHERE bp.organization_id=$1`,
        [orgId],
      ),
      (async () => {
        const db = {query: pgQuery} as PgClient;
        const requirements = await applicableRequirements(db, orgId, kase.rows[0].risk_category_id);
        return evaluateRequirements(db, orgId, requirements);
      })(),
    ]);
    return {
      case: kase.rows[0],
      organization: org.rows[0] || null,
      legal_profile: legal.rows[0] || null,
      business_profile: business.rows[0] || null,
      requirements: checklist,
      documents: documents,
      results: results.rows,
      history: transitions.rows,
    };
  },

  async startReview(caseId: string, actor: Actor) {
    return withPgTransaction(async (client) => {
      const r = await client.query(`SELECT * FROM verification_cases WHERE id=$1 AND case_type='KYB' FOR UPDATE`, [caseId]);
      if (!r.rows[0]) throw notFound('KYB case not found', 'KYB_CASE_NOT_FOUND');
      const updated = await transitionCase(
        client,
        r.rows[0],
        'UNDER_REVIEW',
        {userId: actor.userId, type: 'PLATFORM'},
        'Review started',
        ['assigned_reviewer_user_id=$5'],
        [actor.userId],
      );
      await writeAuditEvent(
        {organizationId: r.rows[0].organization_id, actorUserId: actor.userId, action: 'kyb.case.start_review', resourceType: 'verification_cases', resourceId: caseId, requestId: actor.requestId},
        client,
      );
      return updated;
    });
  },

  async requestInformation(caseId: string, reason: string, actor: Actor) {
    return withPgTransaction(async (client) => {
      const r = await client.query(`SELECT * FROM verification_cases WHERE id=$1 AND case_type='KYB' FOR UPDATE`, [caseId]);
      if (!r.rows[0]) throw notFound('KYB case not found', 'KYB_CASE_NOT_FOUND');
      const updated = await transitionCase(client, r.rows[0], 'NEEDS_INFORMATION', {userId: actor.userId, type: 'PLATFORM'}, reason);
      await appendResult(client, {
        caseId,
        organizationId: r.rows[0].organization_id,
        checkType: 'MANUAL_REVIEW',
        result: 'PENDING',
        reviewerUserId: actor.userId,
        details: {action: 'NEEDS_INFORMATION', reason},
      });
      await writeAuditEvent(
        {organizationId: r.rows[0].organization_id, actorUserId: actor.userId, action: 'kyb.case.request_information', resourceType: 'verification_cases', resourceId: caseId, requestId: actor.requestId, metadata: {reason}},
        client,
      );
      await emitOutboxEvent(
        {organizationId: r.rows[0].organization_id, eventType: 'kyb.case.needs_information', aggregateType: 'verification_case', aggregateId: caseId, payload: {reason, notify_email: await resolveOrganizationNotifyEmail(r.rows[0].organization_id), portal_url: kybMerchantPortalUrl()}},
        client,
      );
      return updated;
    });
  },

  async decide(caseId: string, decision: 'APPROVED' | 'REJECTED', reason: string, riskCategoryCode: string | null, actor: Actor) {
    return withPgTransaction(async (client) => {
      const r = await client.query(`SELECT * FROM verification_cases WHERE id=$1 AND case_type='KYB' FOR UPDATE`, [caseId]);
      if (!r.rows[0]) throw notFound('KYB case not found', 'KYB_CASE_NOT_FOUND');
      const kase = r.rows[0];

      let riskCategoryId: string | null = kase.risk_category_id;
      if (riskCategoryCode) {
        const rc = await client.query(`SELECT id FROM master_risk_categories WHERE code=$1 AND is_active=TRUE`, [riskCategoryCode]);
        if (!rc.rows[0]) throw new AppError('MASTER_CODE_INVALID', `Unknown risk category: ${riskCategoryCode}`, 400);
        riskCategoryId = rc.rows[0].id;
      }

      const updated = await transitionCase(
        client,
        kase,
        decision,
        {userId: actor.userId, type: 'PLATFORM'},
        reason,
        ['decided_at=NOW()', 'decision_reason=$5', 'risk_category_id=$6'],
        [reason, riskCategoryId],
      );
      await appendResult(client, {
        caseId,
        organizationId: kase.organization_id,
        checkType: 'MANUAL_REVIEW',
        result: decision === 'APPROVED' ? 'PASS' : 'FAIL',
        reviewerUserId: actor.userId,
        details: {decision, reason},
      });
      await writeAuditEvent(
        {organizationId: kase.organization_id, actorUserId: actor.userId, action: 'kyb.case.decide', resourceType: 'verification_cases', resourceId: caseId, requestId: actor.requestId, metadata: {decision, reason}},
        client,
      );
      await writeSecurityEvent(
        {organizationId: kase.organization_id, userId: actor.userId, eventType: 'kyb.case.decided', metadata: {case_id: caseId, decision}},
        client,
      );
      await emitOutboxEvent(
        {organizationId: kase.organization_id, eventType: 'kyb.case.decided', aggregateType: 'verification_case', aggregateId: caseId, payload: {decision, reason, notify_email: await resolveOrganizationNotifyEmail(kase.organization_id), portal_url: kybMerchantPortalUrl()}, idempotencyKey: `kyb-decide-${caseId}-v${kase.version}`},
        client,
      );
      return updated;
    });
  },

  async suspend(caseId: string, reason: string, actor: Actor) {
    return withPgTransaction(async (client) => {
      const r = await client.query(`SELECT * FROM verification_cases WHERE id=$1 AND case_type='KYB' FOR UPDATE`, [caseId]);
      if (!r.rows[0]) throw notFound('KYB case not found', 'KYB_CASE_NOT_FOUND');
      const updated = await transitionCase(client, r.rows[0], 'SUSPENDED', {userId: actor.userId, type: 'PLATFORM'}, reason);
      await writeAuditEvent(
        {organizationId: r.rows[0].organization_id, actorUserId: actor.userId, action: 'kyb.case.suspend', resourceType: 'verification_cases', resourceId: caseId, requestId: actor.requestId, metadata: {reason}},
        client,
      );
      await writeSecurityEvent(
        {organizationId: r.rows[0].organization_id, userId: actor.userId, eventType: 'kyb.case.suspended', metadata: {case_id: caseId, reason}},
        client,
      );
      return updated;
    });
  },
};
