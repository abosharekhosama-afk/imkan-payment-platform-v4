import type {FastifyInstance, FastifyRequest} from 'fastify';
import {z} from 'zod';
import {requireOrganizationContext, requirePermission, requireStepUp} from '../../../foundation/authz.js';
import {completeIdempotency, failIdempotency, idempotencyPreHandler} from '../../../foundation/idempotency.js';
import {created, ok, parsePaging} from '../../../foundation/http.js';
import {AppError, forbidden} from '../../../foundation/errors.js';
import {listMasterTypes, masterDataService} from '../../../merchant/master-data.js';
import {merchantService, type PersonKind} from '../../../merchant/merchant-service.js';
import {documentsService} from '../../../merchant/documents-service.js';
import {kybService} from '../../../merchant/kyb-service.js';
import {bankAccountsService} from '../../../merchant/bank-accounts-service.js';
import {getOnboardingGateState} from '../../../security/onboarding-gate.js';

const masterTypeParam = z.object({type: z.string().min(1).max(60)});
const codeSchema = z.string().min(1).max(80).regex(/^[A-Za-z0-9_.\-]+$/);

const DOCUMENT_UPLOAD_LIMIT = 25 * 1024 * 1024;

const BINARY_UPLOAD_CONTENT_TYPES = [
  'application/octet-stream',
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/bmp',
];

function registerDocumentBinaryParsers(app: FastifyInstance) {
  const parser = (_req: unknown, body: Buffer, done: (err: Error | null, value?: Buffer) => void) => {
    done(null, body);
  };
  for (const contentType of BINARY_UPLOAD_CONTENT_TYPES) {
    app.addContentTypeParser(contentType, {parseAs: 'buffer', bodyLimit: DOCUMENT_UPLOAD_LIMIT}, parser);
  }
}

async function readBinaryUploadBody(request: FastifyRequest): Promise<Buffer> {
  const parsed = request.body;
  if (Buffer.isBuffer(parsed)) return parsed;
  if (parsed instanceof Uint8Array) return Buffer.from(parsed);
  const chunks: Buffer[] = [];
  for await (const chunk of request.raw) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

const personBody = z.object({
  full_name: z.string().min(1).max(300),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  nationality_country_code: z.string().length(2).optional(),
  identification_type_code: codeSchema.optional(),
  identification_number: z.string().min(3).max(60).optional(),
  ownership_percent: z.string().regex(/^\d{1,3}(\.\d{1,2})?$/).optional(),
  is_pep: z.boolean().optional(),
  title: z.string().max(200).optional(),
  role_title: z.string().max(200).optional(),
  is_signatory: z.boolean().optional(),
});

export async function registerPhase3Routes(app: FastifyInstance) {
  registerDocumentBinaryParsers(app);
  // ------------------------------------------------------------- master data

  app.get(
    '/master-data/types',
    {preHandler: [requirePermission('org.read', 'masterdata.manage', 'platform.admin', 'platform.support')]},
    async (request) => ok(request, listMasterTypes()),
  );

  app.get(
    '/master-data/:type',
    {preHandler: [requirePermission('org.read', 'masterdata.manage', 'platform.admin', 'platform.support')]},
    async (request) => {
      const params = masterTypeParam.parse(request.params);
      const query = z.object({include_inactive: z.enum(['true', 'false']).optional()}).parse(request.query);
      const includeInactive = query.include_inactive === 'true';
      if (includeInactive && !request.auth!.permissions.includes('masterdata.manage')) {
        throw forbidden('masterdata.manage required to view inactive records');
      }
      return ok(request, await masterDataService.list(params.type, includeInactive));
    },
  );

  app.post('/master-data/:type', {preHandler: [requirePermission('masterdata.manage')]}, async (request, reply) => {
    const params = masterTypeParam.parse(request.params);
    const body = z
      .object({
        code: codeSchema,
        name: z.string().min(1).max(300),
        description: z.string().max(2000).optional(),
        labels: z.record(z.string(), z.string()).optional(),
        sort_order: z.number().int().min(0).max(1_000_000).optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
        extra: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(request.body);
    const row = await masterDataService.create(
      params.type,
      {
        code: body.code,
        name: body.name,
        description: body.description,
        labels: body.labels,
        sortOrder: body.sort_order,
        metadata: body.metadata,
        extra: body.extra,
      },
      {userId: request.auth!.userId, requestId: request.id},
    );
    return created(reply, request, row);
  });

  app.patch('/master-data/:type/:code', {preHandler: [requirePermission('masterdata.manage')]}, async (request) => {
    const params = masterTypeParam.extend({code: codeSchema}).parse(request.params);
    const body = z
      .object({
        name: z.string().min(1).max(300).optional(),
        description: z.string().max(2000).optional(),
        labels: z.record(z.string(), z.string()).optional(),
        sort_order: z.number().int().min(0).max(1_000_000).optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
        extra: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(request.body);
    const row = await masterDataService.update(
      params.type,
      params.code,
      {name: body.name, description: body.description, labels: body.labels, sortOrder: body.sort_order, metadata: body.metadata, extra: body.extra},
      {userId: request.auth!.userId, requestId: request.id},
    );
    return ok(request, row);
  });

  for (const action of ['activate', 'deactivate'] as const) {
    app.post(`/master-data/:type/:code/${action}`, {preHandler: [requirePermission('masterdata.manage')]}, async (request) => {
      const params = masterTypeParam.extend({code: codeSchema}).parse(request.params);
      const row = await masterDataService.setActive(params.type, params.code, action === 'activate', {
        userId: request.auth!.userId,
        requestId: request.id,
      });
      return ok(request, row);
    });
  }

  // -------------------------------------------------------- merchant profile

  app.get(
    '/merchant/profile',
    {preHandler: [requireOrganizationContext(), requirePermission('merchant.read')]},
    async (request) => ok(request, await merchantService.getProfileBundle(request.auth!.organizationId!)),
  );

  app.put(
    '/merchant/profile',
    {preHandler: [requireOrganizationContext(), requirePermission('merchant.manage')]},
    async (request) => {
      const body = z
        .object({
          trading_name: z.string().max(300).optional(),
          website: z.string().url().max(500).optional(),
          support_email: z.string().email().optional(),
          support_phone: z.string().max(40).optional(),
        })
        .parse(request.body);
      const row = await merchantService.upsertProfile(
        request.auth!.organizationId!,
        {tradingName: body.trading_name, website: body.website, supportEmail: body.support_email, supportPhone: body.support_phone},
        {userId: request.auth!.userId, requestId: request.id},
      );
      return ok(request, row);
    },
  );

  app.put(
    '/merchant/legal-profile',
    {preHandler: [requireOrganizationContext(), requirePermission('merchant.manage')]},
    async (request) => {
      const body = z
        .object({
          legal_name: z.string().min(2).max(300),
          trading_name: z.string().max(300).optional(),
          registration_number: z.string().max(100).optional(),
          legal_entity_type_code: codeSchema.optional(),
          incorporation_country_code: z.string().length(2).optional(),
          incorporation_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          tax_type_code: codeSchema.optional(),
          tax_id: z.string().max(100).optional(),
          vat_number: z.string().max(100).optional(),
          addresses: z
            .array(
              z.object({
                address_type_code: codeSchema,
                line1: z.string().min(1).max(300),
                line2: z.string().max(300).optional(),
                city: z.string().min(1).max(120),
                state_region: z.string().max(120).optional(),
                postal_code: z.string().max(30).optional(),
                country_code: z.string().length(2),
              }),
            )
            .max(5)
            .optional(),
        })
        .parse(request.body);
      const row = await merchantService.upsertLegalProfile(
        request.auth!.organizationId!,
        {
          legalName: body.legal_name,
          tradingName: body.trading_name,
          registrationNumber: body.registration_number,
          legalEntityTypeCode: body.legal_entity_type_code,
          incorporationCountryCode: body.incorporation_country_code,
          incorporationDate: body.incorporation_date,
          taxTypeCode: body.tax_type_code,
          taxId: body.tax_id,
          vatNumber: body.vat_number,
          addresses: (body.addresses || []).map((a) => ({
            addressTypeCode: a.address_type_code,
            line1: a.line1,
            line2: a.line2,
            city: a.city,
            stateRegion: a.state_region,
            postalCode: a.postal_code,
            countryCode: a.country_code,
          })),
        },
        {userId: request.auth!.userId, requestId: request.id},
      );
      return ok(request, {...row, tax_id: undefined});
    },
  );

  app.put(
    '/merchant/business-profile',
    {preHandler: [requireOrganizationContext(), requirePermission('merchant.manage')]},
    async (request) => {
      const body = z
        .object({
          business_type_code: codeSchema.optional(),
          industry_code: codeSchema.optional(),
          description: z.string().max(4000).optional(),
          website: z.string().url().max(500).optional(),
          products_services: z.string().max(4000).optional(),
          expected_monthly_volume_minor: z.string().regex(/^\d{1,30}$/).optional(),
          average_transaction_minor: z.string().regex(/^\d{1,30}$/).optional(),
          volume_currency_code: z.string().length(3).optional(),
          countries_served: z.array(z.string().length(2)).max(100).optional(),
          currencies_accepted: z.array(z.string().length(3)).max(50).optional(),
        })
        .parse(request.body);
      const row = await merchantService.upsertBusinessProfile(
        request.auth!.organizationId!,
        {
          businessTypeCode: body.business_type_code,
          industryCode: body.industry_code,
          description: body.description,
          website: body.website,
          productsServices: body.products_services,
          expectedMonthlyVolumeMinor: body.expected_monthly_volume_minor,
          averageTransactionMinor: body.average_transaction_minor,
          volumeCurrencyCode: body.volume_currency_code,
          countriesServed: body.countries_served,
          currenciesAccepted: body.currencies_accepted,
        },
        {userId: request.auth!.userId, requestId: request.id},
      );
      return ok(request, row);
    },
  );

  // ----------------------------------------------------------------- people

  const personKinds: Array<{kind: PersonKind; path: string}> = [
    {kind: 'owner', path: 'owners'},
    {kind: 'director', path: 'directors'},
    {kind: 'representative', path: 'representatives'},
  ];
  for (const {kind, path} of personKinds) {
    app.post(
      `/merchant/${path}`,
      {preHandler: [requireOrganizationContext(), requirePermission('merchant.manage')]},
      async (request, reply) => {
        const body = personBody.parse(request.body);
        if (kind === 'owner' && !body.ownership_percent) {
          return reply.code(400).send({
            error: {code: 'OWNERSHIP_PERCENT_REQUIRED', message: 'ownership_percent is required for beneficial owners', request_id: request.id},
          });
        }
        const row = await merchantService.addPerson(
          kind,
          request.auth!.organizationId!,
          {
            fullName: body.full_name,
            dateOfBirth: body.date_of_birth,
            nationalityCountryCode: body.nationality_country_code,
            identificationTypeCode: body.identification_type_code,
            identificationNumber: body.identification_number,
            ownershipPercent: body.ownership_percent,
            isPep: body.is_pep,
            title: body.title,
            roleTitle: body.role_title,
            isSignatory: body.is_signatory,
          },
          {userId: request.auth!.userId, requestId: request.id},
        );
        return created(reply, request, row);
      },
    );

    app.post(
      `/merchant/${path}/:personId/remove`,
      {preHandler: [requireOrganizationContext(), requirePermission('merchant.manage')]},
      async (request) => {
        const params = z.object({personId: z.string().uuid()}).parse(request.params);
        const row = await merchantService.removePerson(kind, request.auth!.organizationId!, params.personId, {
          userId: request.auth!.userId,
          requestId: request.id,
        });
        return ok(request, row);
      },
    );
  }

  // -------------------------------------------------------------- documents

  app.get(
    '/merchant/documents',
    {preHandler: [requireOrganizationContext(), requirePermission('documents.read')]},
    async (request) => ok(request, await documentsService.list(request.auth!.organizationId!)),
  );

  app.post(
    '/merchant/documents',
    {preHandler: [requireOrganizationContext(), requirePermission('documents.manage')]},
    async (request, reply) => {
      const body = z
        .object({
          document_type_code: codeSchema,
          subject_type: z.enum(['ORGANIZATION', 'BENEFICIAL_OWNER', 'DIRECTOR', 'REPRESENTATIVE', 'PAYOUT_ACCOUNT']).optional(),
          subject_id: z.string().uuid().optional(),
          file_name: z.string().min(1).max(300),
          mime_type: z.string().min(3).max(150),
          size_bytes: z.number().int().min(0).max(100 * 1024 * 1024),
          sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
          storage_key: z.string().max(500).optional(),
        })
        .parse(request.body);
      const row = await documentsService.register(
        request.auth!.organizationId!,
        {
          documentTypeCode: body.document_type_code,
          subjectType: body.subject_type,
          subjectId: body.subject_id,
          fileName: body.file_name,
          mimeType: body.mime_type,
          sizeBytes: body.size_bytes,
          sha256: body.sha256,
          storageKey: body.storage_key,
        },
        {userId: request.auth!.userId, requestId: request.id},
      );
      return created(reply, request, row);
    },
  );

  app.post(
    '/merchant/documents/:documentId/archive',
    {preHandler: [requireOrganizationContext(), requirePermission('documents.manage')]},
    async (request) => {
      const params = z.object({documentId: z.string().uuid()}).parse(request.params);
      return ok(
        request,
        await documentsService.archive(request.auth!.organizationId!, params.documentId, {userId: request.auth!.userId, requestId: request.id}),
      );
    },
  );

  app.post(
    '/merchant/documents/upload-intent',
    {preHandler: [requireOrganizationContext(), requirePermission('documents.manage')]},
    async (request, reply) => {
      const body = z
        .object({
          document_type_code: codeSchema,
          subject_type: z.enum(['ORGANIZATION', 'BENEFICIAL_OWNER', 'DIRECTOR', 'REPRESENTATIVE', 'PAYOUT_ACCOUNT']).optional(),
          subject_id: z.string().uuid().optional(),
          file_name: z.string().min(1).max(300),
          mime_type: z.string().min(3).max(150),
          size_bytes: z.number().int().min(1).max(25 * 1024 * 1024),
        })
        .parse(request.body);
      const row = await documentsService.createUploadIntent(
        request.auth!.organizationId!,
        {
          documentTypeCode: body.document_type_code,
          subjectType: body.subject_type,
          subjectId: body.subject_id,
          fileName: body.file_name,
          mimeType: body.mime_type,
          sizeBytes: body.size_bytes,
        },
        {userId: request.auth!.userId, requestId: request.id},
      );
      return created(reply, request, row);
    },
  );

  app.put(
    '/merchant/documents/:documentId/content',
    {
      preHandler: [requireOrganizationContext(), requirePermission('documents.manage')],
      bodyLimit: DOCUMENT_UPLOAD_LIMIT,
    },
    async (request, reply) => {
      const params = z.object({documentId: z.string().uuid()}).parse(request.params);
      const body = await readBinaryUploadBody(request);
      if (!body.length) {
        throw new AppError('DOCUMENT_EMPTY', 'Uploaded file is empty. Choose a PDF or image and try again.', 400);
      }
      const row = await documentsService.uploadContent(request.auth!.organizationId!, params.documentId, body, {
        userId: request.auth!.userId,
        requestId: request.id,
      });
      return ok(request, row);
    },
  );

  app.get(
    '/merchant/documents/:documentId/content',
    {preHandler: [requireOrganizationContext(), requirePermission('documents.read')]},
    async (request, reply) => {
      const params = z.object({documentId: z.string().uuid()}).parse(request.params);
      const content = await documentsService.getContent(params.documentId, {organizationId: request.auth!.organizationId!});
      if (content.mode === 'redirect') {
        return reply.redirect(content.url);
      }
      reply.header('content-type', content.mimeType);
      reply.header('content-disposition', `inline; filename="${content.fileName.replace(/"/g, '')}"`);
      return reply.send(content.buffer);
    },
  );

  // -------------------------------------------------------------------- KYB

  app.get(
    '/merchant/kyb',
    {preHandler: [requireOrganizationContext(), requirePermission('kyb.read')]},
    async (request) => ok(request, await kybService.getCaseOverview(request.auth!.organizationId!)),
  );

  app.get(
    '/merchant/onboarding-gate',
    {preHandler: [requireOrganizationContext()]},
    async (request) => ok(request, await getOnboardingGateState(request.auth!.organizationId!)),
  );

  app.post(
    '/merchant/kyb/submit',
    {preHandler: [requireOrganizationContext(), requirePermission('kyb.submit'), idempotencyPreHandler('kyb.submit')]},
    async (request) => {
      try {
        const row = await kybService.submit(request.auth!.organizationId!, {userId: request.auth!.userId, requestId: request.id});
        const payload = ok(request, row);
        await completeIdempotency(request, 200, payload);
        return payload;
      } catch (error) {
        await failIdempotency(request);
        throw error;
      }
    },
  );

  // ------------------------------------------------------------ bank accounts

  app.get(
    '/merchant/bank-accounts',
    {preHandler: [requireOrganizationContext(), requirePermission('bank.read')]},
    async (request) => ok(request, await bankAccountsService.list(request.auth!.organizationId!)),
  );

  app.get(
    '/merchant/bank-accounts/:accountId',
    {preHandler: [requireOrganizationContext(), requirePermission('bank.read')]},
    async (request) => {
      const params = z.object({accountId: z.string().uuid()}).parse(request.params);
      return ok(request, await bankAccountsService.get(request.auth!.organizationId!, params.accountId));
    },
  );

  app.post(
    '/merchant/bank-accounts',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('bank.manage'),
        requireStepUp(),
        idempotencyPreHandler('bank_account.create'),
      ],
    },
    async (request, reply) => {
      try {
        const body = z
          .object({
            payout_method_code: codeSchema,
            currency_code: z.string().length(3),
            country_code: z.string().length(2),
            bank_name: z.string().min(2).max(300),
            account_holder_name: z.string().min(2).max(300),
            holder_relationship: z.enum(['COMPANY', 'OWNER', 'OTHER']).optional(),
            account_type: z.enum(['IBAN', 'ACCOUNT_NUMBER']),
            account_value: z.string().min(4).max(60),
            swift_bic: z.string().max(20).optional(),
          })
          .parse(request.body);
        const row = await bankAccountsService.create(
          request.auth!.organizationId!,
          {
            payoutMethodCode: body.payout_method_code,
            currencyCode: body.currency_code.toUpperCase(),
            countryCode: body.country_code.toUpperCase(),
            bankName: body.bank_name,
            accountHolderName: body.account_holder_name,
            holderRelationship: body.holder_relationship,
            accountType: body.account_type,
            accountValue: body.account_value,
            swiftBic: body.swift_bic,
          },
          {userId: request.auth!.userId, requestId: request.id},
        );
        const payload = {data: row, meta: {request_id: request.id}};
        await completeIdempotency(request, 201, payload);
        return created(reply, request, row);
      } catch (error) {
        await failIdempotency(request);
        throw error;
      }
    },
  );

  app.post(
    '/merchant/bank-accounts/:accountId/activate',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('bank.manage'),
        requireStepUp('bank.account.activate'),
        idempotencyPreHandler('bank.account.activate'),
      ],
    },
    async (request) => {
      const params = z.object({accountId: z.string().uuid()}).parse(request.params);
      try {
        const row = await bankAccountsService.activate(request.auth!.organizationId!, params.accountId, {
          userId: request.auth!.userId,
          requestId: request.id,
        });
        const payload = ok(request, row);
        await completeIdempotency(request, 200, payload);
        return payload;
      } catch (error) {
        await failIdempotency(request);
        throw error;
      }
    },
  );

  app.post(
    '/merchant/bank-accounts/:accountId/deactivate',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('bank.manage'),
        requireStepUp('bank.account.activate'),
        idempotencyPreHandler('bank.account.deactivate'),
      ],
    },
    async (request) => {
      const params = z.object({accountId: z.string().uuid()}).parse(request.params);
      const body = z.object({reason: z.string().max(1000).optional()}).parse(request.body || {});
      try {
        const row = await bankAccountsService.deactivate(
          request.auth!.organizationId!,
          params.accountId,
          body.reason || null,
          {userId: request.auth!.userId, requestId: request.id},
        );
        const payload = ok(request, row);
        await completeIdempotency(request, 200, payload);
        return payload;
      } catch (error) {
        await failIdempotency(request);
        throw error;
      }
    },
  );

  app.post(
    '/merchant/bank-accounts/:accountId/set-default',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('bank.manage'),
        requireStepUp('bank.account.set_default'),
      ],
    },
    async (request) => {
      const params = z.object({accountId: z.string().uuid()}).parse(request.params);
      return ok(
        request,
        await bankAccountsService.setDefault(request.auth!.organizationId!, params.accountId, {userId: request.auth!.userId, requestId: request.id}),
      );
    },
  );

  // ---------------------------------------------------------- platform admin

  app.get('/admin/kyb/cases', {preHandler: [requirePermission('kyb.review')]}, async (request) => {
    const query = z.object({status: z.string().max(30).optional()}).parse(request.query);
    const {limit, offset} = parsePaging(request.query);
    return ok(request, await kybService.listCases({status: query.status, limit, offset}), {limit, offset});
  });

  app.get('/admin/kyb/cases/:caseId', {preHandler: [requirePermission('kyb.review')]}, async (request) => {
    const params = z.object({caseId: z.string().uuid()}).parse(request.params);
    return ok(request, await kybService.getCaseDetail(params.caseId));
  });

  app.post('/admin/kyb/cases/:caseId/start-review', {preHandler: [requirePermission('kyb.review')]}, async (request) => {
    const params = z.object({caseId: z.string().uuid()}).parse(request.params);
    return ok(request, await kybService.startReview(params.caseId, {userId: request.auth!.userId, requestId: request.id}));
  });

  app.post('/admin/kyb/cases/:caseId/request-information', {preHandler: [requirePermission('kyb.review')]}, async (request) => {
    const params = z.object({caseId: z.string().uuid()}).parse(request.params);
    const body = z.object({reason: z.string().min(3).max(2000)}).parse(request.body);
    return ok(request, await kybService.requestInformation(params.caseId, body.reason, {userId: request.auth!.userId, requestId: request.id}));
  });

  app.post(
    '/admin/kyb/cases/:caseId/decision',
    {preHandler: [requirePermission('kyb.review'), requireStepUp(), idempotencyPreHandler('kyb.decision')]},
    async (request) => {
      try {
        const params = z.object({caseId: z.string().uuid()}).parse(request.params);
        const body = z
          .object({
            decision: z.enum(['APPROVED', 'REJECTED']),
            reason: z.string().min(3).max(2000),
            risk_category_code: codeSchema.optional(),
          })
          .parse(request.body);
        const row = await kybService.decide(params.caseId, body.decision, body.reason, body.risk_category_code || null, {
          userId: request.auth!.userId,
          requestId: request.id,
        });
        const payload = ok(request, row);
        await completeIdempotency(request, 200, payload);
        return payload;
      } catch (error) {
        await failIdempotency(request);
        throw error;
      }
    },
  );

  app.post(
    '/admin/kyb/cases/:caseId/suspend',
    {preHandler: [requirePermission('kyb.review'), requireStepUp()]},
    async (request) => {
      const params = z.object({caseId: z.string().uuid()}).parse(request.params);
      const body = z.object({reason: z.string().min(3).max(2000)}).parse(request.body);
      return ok(request, await kybService.suspend(params.caseId, body.reason, {userId: request.auth!.userId, requestId: request.id}));
    },
  );

  app.post('/admin/documents/:documentId/review', {preHandler: [requirePermission('kyb.review')]}, async (request) => {
    const params = z.object({documentId: z.string().uuid()}).parse(request.params);
    const body = z
      .object({decision: z.enum(['ACCEPTED', 'REJECTED']), reason: z.string().max(2000).optional()})
      .parse(request.body);
    return ok(
      request,
      await documentsService.review(params.documentId, body.decision, body.reason || null, {userId: request.auth!.userId, requestId: request.id}),
    );
  });

  app.get('/admin/documents/:documentId/content', {preHandler: [requirePermission('kyb.review')]}, async (request, reply) => {
    const params = z.object({documentId: z.string().uuid()}).parse(request.params);
    const content = await documentsService.getContent(params.documentId, {admin: true});
    if (content.mode === 'redirect') {
      return reply.redirect(content.url);
    }
    reply.header('content-type', content.mimeType);
    reply.header('content-disposition', `inline; filename="${content.fileName.replace(/"/g, '')}"`);
    return reply.send(content.buffer);
  });

  app.get('/admin/bank-accounts', {preHandler: [requirePermission('bank.review', 'platform.admin')]}, async (request) => {
    const query = z.object({status: z.string().max(30).optional()}).parse(request.query);
    const {limit, offset} = parsePaging(request.query);
    return ok(request, await bankAccountsService.listForReview({status: query.status, limit, offset}), {limit, offset});
  });

  app.get(
    '/admin/bank-accounts/:accountId',
    {preHandler: [requirePermission('bank.review', 'platform.admin')]},
    async (request) => {
      const params = z.object({accountId: z.string().uuid()}).parse(request.params);
      return ok(request, await bankAccountsService.getForReview(params.accountId));
    },
  );

  app.post(
    '/admin/bank-accounts/:accountId/verification/start',
    {preHandler: [requirePermission('bank.review', 'platform.admin')]},
    async (request) => {
      const params = z.object({accountId: z.string().uuid()}).parse(request.params);
      return ok(request, await bankAccountsService.startVerification(params.accountId, {userId: request.auth!.userId, requestId: request.id}));
    },
  );

  app.post(
    '/admin/bank-accounts/:accountId/verification/decision',
    {preHandler: [requirePermission('bank.review', 'platform.admin'), requireStepUp(), idempotencyPreHandler('bank.verification.decision')]},
    async (request) => {
      try {
        const params = z.object({accountId: z.string().uuid()}).parse(request.params);
        const body = z
          .object({result: z.enum(['PASSED', 'FAILED']), reason: z.string().min(3).max(2000)})
          .parse(request.body);
        const row = await bankAccountsService.decideVerification(params.accountId, body.result, body.reason, {
          userId: request.auth!.userId,
          requestId: request.id,
        });
        const payload = ok(request, row);
        await completeIdempotency(request, 200, payload);
        return payload;
      } catch (error) {
        await failIdempotency(request);
        throw error;
      }
    },
  );

  app.post(
    '/admin/bank-accounts/:accountId/activate',
    {
      preHandler: [
        requirePermission('bank.review', 'platform.admin'),
        requireStepUp('bank.account.activate'),
        idempotencyPreHandler('bank.account.admin_activate'),
      ],
    },
    async (request) => {
      const params = z.object({accountId: z.string().uuid()}).parse(request.params);
      try {
        const row = await bankAccountsService.adminActivate(params.accountId, {
          userId: request.auth!.userId,
          requestId: request.id,
        });
        const payload = ok(request, row);
        await completeIdempotency(request, 200, payload);
        return payload;
      } catch (error) {
        await failIdempotency(request);
        throw error;
      }
    },
  );
}
