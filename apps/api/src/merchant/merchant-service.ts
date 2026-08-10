import {pgQuery, withPgTransaction, type PgClient} from '../infrastructure/db/postgres.js';
import {AppError, notFound} from '../foundation/errors.js';
import {writeAuditEvent} from '../foundation/audit.js';
import {encryptBankSecret, identificationFingerprint, maskTail} from '../foundation/crypto.js';
import {resolveMasterId} from './master-data.js';
import {flagDataChangedAfterApproval} from './kyb-service.js';

type Actor = {userId: string; requestId?: string};

const PERSON_TABLES = {
  owner: 'beneficial_owners',
  director: 'directors',
  representative: 'authorized_representatives',
} as const;

export type PersonKind = keyof typeof PERSON_TABLES;

function maskPerson(row: any) {
  const {identification_number_encrypted, identification_fingerprint, ...rest} = row;
  return {
    ...rest,
    identification_number_masked: row.identification_last4 ? maskTail(row.identification_last4) : null,
  };
}

async function encryptIdentification(
  client: PgClient,
  input: {identificationTypeCode?: string; identificationNumber?: string},
): Promise<{typeId: string | null; encrypted: string | null; last4: string | null; fingerprint: string | null}> {
  if (!input.identificationNumber) return {typeId: null, encrypted: null, last4: null, fingerprint: null};
  if (!input.identificationTypeCode) {
    throw new AppError('IDENTIFICATION_TYPE_REQUIRED', 'identification_type_code is required with identification_number', 400);
  }
  const typeId = await resolveMasterId('master_identification_types', input.identificationTypeCode, client);
  return {
    typeId,
    encrypted: encryptBankSecret(input.identificationNumber),
    last4: input.identificationNumber.replace(/[\s-]+/g, '').slice(-4),
    fingerprint: identificationFingerprint(input.identificationTypeCode, input.identificationNumber),
  };
}

export const merchantService = {
  // ------------------------------------------------------------------ profile

  async getProfileBundle(organizationId: string) {
    const [profile, legal, business, addresses, owners, directors, reps] = await Promise.all([
      pgQuery(`SELECT * FROM merchant_profiles WHERE organization_id=$1`, [organizationId]),
      pgQuery(
        `SELECT clp.*, let.code AS legal_entity_type_code, c.code AS incorporation_country_code, tt.code AS tax_type_code
         FROM company_legal_profiles clp
         LEFT JOIN master_legal_entity_types let ON let.id = clp.legal_entity_type_id
         LEFT JOIN master_countries c ON c.id = clp.incorporation_country_id
         LEFT JOIN master_tax_types tt ON tt.id = clp.tax_type_id
         WHERE clp.organization_id=$1`,
        [organizationId],
      ),
      pgQuery(
        `SELECT bp.*, bt.code AS business_type_code, i.code AS industry_code
         FROM business_profiles bp
         LEFT JOIN master_business_types bt ON bt.id = bp.business_type_id
         LEFT JOIN master_industries i ON i.id = bp.industry_id
         WHERE bp.organization_id=$1`,
        [organizationId],
      ),
      pgQuery(
        `SELECT ca.*, at.code AS address_type_code, c.code AS country_code
         FROM company_addresses ca
         JOIN master_address_types at ON at.id = ca.address_type_id
         JOIN master_countries c ON c.id = ca.country_id
         WHERE ca.organization_id=$1
         ORDER BY at.sort_order`,
        [organizationId],
      ),
      pgQuery(`SELECT * FROM beneficial_owners WHERE organization_id=$1 AND status='ACTIVE' ORDER BY created_at`, [organizationId]),
      pgQuery(`SELECT * FROM directors WHERE organization_id=$1 AND status='ACTIVE' ORDER BY created_at`, [organizationId]),
      pgQuery(`SELECT * FROM authorized_representatives WHERE organization_id=$1 AND status='ACTIVE' ORDER BY created_at`, [organizationId]),
    ]);

    const bp = business.rows[0] as any;
    let servedCountries: string[] = [];
    let acceptedCurrencies: string[] = [];
    if (bp) {
      const [sc, ac] = await Promise.all([
        pgQuery(
          `SELECT c.code FROM business_profile_countries bpc JOIN master_countries c ON c.id=bpc.country_id WHERE bpc.business_profile_id=$1 ORDER BY c.code`,
          [bp.id],
        ),
        pgQuery(
          `SELECT cur.code FROM business_profile_currencies bpcur JOIN master_currencies cur ON cur.id=bpcur.currency_id WHERE bpcur.business_profile_id=$1 ORDER BY cur.code`,
          [bp.id],
        ),
      ]);
      servedCountries = sc.rows.map((r: any) => String(r.code).trim());
      acceptedCurrencies = ac.rows.map((r: any) => String(r.code).trim());
    }

    const legalRow = legal.rows[0] as any;
    return {
      profile: profile.rows[0] || null,
      legal_profile: legalRow
        ? {...legalRow, tax_id: legalRow.tax_id ? maskTail(String(legalRow.tax_id)) : null}
        : null,
      business_profile: bp ? {...bp, countries_served: servedCountries, currencies_accepted: acceptedCurrencies} : null,
      addresses: addresses.rows,
      beneficial_owners: owners.rows.map(maskPerson),
      directors: directors.rows.map(maskPerson),
      authorized_representatives: reps.rows.map(maskPerson),
    };
  },

  async upsertProfile(
    organizationId: string,
    input: {tradingName?: string; website?: string; supportEmail?: string; supportPhone?: string},
    actor: Actor,
  ) {
    return withPgTransaction(async (client) => {
      const r = await client.query(
        `INSERT INTO merchant_profiles (organization_id, trading_name, website, support_email, support_phone)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (organization_id) DO UPDATE
           SET trading_name=COALESCE($2, merchant_profiles.trading_name),
               website=COALESCE($3, merchant_profiles.website),
               support_email=COALESCE($4, merchant_profiles.support_email),
               support_phone=COALESCE($5, merchant_profiles.support_phone),
               updated_at=NOW()
         RETURNING *`,
        [organizationId, input.tradingName || null, input.website || null, input.supportEmail || null, input.supportPhone || null],
      );
      await writeAuditEvent(
        {organizationId, actorUserId: actor.userId, action: 'merchant.profile.upsert', resourceType: 'merchant_profiles', resourceId: r.rows[0].id, requestId: actor.requestId, after: r.rows[0]},
        client,
      );
      return r.rows[0];
    });
  },

  // ------------------------------------------------------------- legal profile

  async upsertLegalProfile(
    organizationId: string,
    input: {
      legalName: string;
      tradingName?: string;
      registrationNumber?: string;
      legalEntityTypeCode?: string;
      incorporationCountryCode?: string;
      incorporationDate?: string;
      taxTypeCode?: string;
      taxId?: string;
      vatNumber?: string;
      addresses?: Array<{
        addressTypeCode: string;
        line1: string;
        line2?: string;
        city: string;
        stateRegion?: string;
        postalCode?: string;
        countryCode: string;
      }>;
    },
    actor: Actor,
  ) {
    return withPgTransaction(async (client) => {
      await assertKybEditable(client, organizationId, actor);

      const legalEntityTypeId = input.legalEntityTypeCode
        ? await resolveMasterId('master_legal_entity_types', input.legalEntityTypeCode, client)
        : null;
      const incorporationCountryId = input.incorporationCountryCode
        ? await resolveMasterId('master_countries', input.incorporationCountryCode, client)
        : null;
      const taxTypeId = input.taxTypeCode ? await resolveMasterId('master_tax_types', input.taxTypeCode, client) : null;

      const before = await client.query(`SELECT * FROM company_legal_profiles WHERE organization_id=$1`, [organizationId]);
      const r = await client.query(
        `INSERT INTO company_legal_profiles (
           organization_id, legal_name, trading_name, registration_number, legal_entity_type_id,
           incorporation_country_id, incorporation_date, tax_type_id, tax_id, vat_number
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (organization_id) DO UPDATE SET
           legal_name=$2, trading_name=$3, registration_number=$4, legal_entity_type_id=$5,
           incorporation_country_id=$6, incorporation_date=$7, tax_type_id=$8,
           tax_id=COALESCE($9, company_legal_profiles.tax_id),
           vat_number=COALESCE($10, company_legal_profiles.vat_number),
           updated_at=NOW()
         RETURNING *`,
        [
          organizationId,
          input.legalName,
          input.tradingName || null,
          input.registrationNumber || null,
          legalEntityTypeId,
          incorporationCountryId,
          input.incorporationDate || null,
          taxTypeId,
          input.taxId || null,
          input.vatNumber || null,
        ],
      );

      for (const addr of input.addresses || []) {
        const addressTypeId = await resolveMasterId('master_address_types', addr.addressTypeCode, client);
        const countryId = await resolveMasterId('master_countries', addr.countryCode, client);
        await client.query(
          `INSERT INTO company_addresses (organization_id, address_type_id, line1, line2, city, state_region, postal_code, country_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (organization_id, address_type_id) DO UPDATE SET
             line1=$3, line2=$4, city=$5, state_region=$6, postal_code=$7, country_id=$8, updated_at=NOW()`,
          [organizationId, addressTypeId, addr.line1, addr.line2 || null, addr.city, addr.stateRegion || null, addr.postalCode || null, countryId],
        );
      }

      await writeAuditEvent(
        {
          organizationId,
          actorUserId: actor.userId,
          action: 'merchant.legal_profile.upsert',
          resourceType: 'company_legal_profiles',
          resourceId: r.rows[0].id,
          requestId: actor.requestId,
          before: before.rows[0] ? {...before.rows[0], tax_id: '[REDACTED]'} : null,
          after: {...r.rows[0], tax_id: '[REDACTED]'},
        },
        client,
      );
      return r.rows[0];
    });
  },

  // ---------------------------------------------------------- business profile

  async upsertBusinessProfile(
    organizationId: string,
    input: {
      businessTypeCode?: string;
      industryCode?: string;
      description?: string;
      website?: string;
      productsServices?: string;
      expectedMonthlyVolumeMinor?: string;
      averageTransactionMinor?: string;
      volumeCurrencyCode?: string;
      countriesServed?: string[];
      currenciesAccepted?: string[];
    },
    actor: Actor,
  ) {
    return withPgTransaction(async (client) => {
      await assertKybEditable(client, organizationId, actor);

      const businessTypeId = input.businessTypeCode
        ? await resolveMasterId('master_business_types', input.businessTypeCode, client)
        : null;
      const industryId = input.industryCode ? await resolveMasterId('master_industries', input.industryCode, client) : null;
      if ((input.expectedMonthlyVolumeMinor || input.averageTransactionMinor) && !input.volumeCurrencyCode) {
        throw new AppError('VOLUME_CURRENCY_REQUIRED', 'volume_currency_code is required with volume amounts', 400);
      }
      if (input.volumeCurrencyCode) {
        await resolveMasterId('master_currencies', input.volumeCurrencyCode, client);
      }

      const r = await client.query(
        `INSERT INTO business_profiles (
           organization_id, business_type_id, industry_id, description, website, products_services,
           expected_monthly_volume_minor, average_transaction_minor, volume_currency_code
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (organization_id) DO UPDATE SET
           business_type_id=$2, industry_id=$3, description=$4, website=$5, products_services=$6,
           expected_monthly_volume_minor=$7, average_transaction_minor=$8, volume_currency_code=$9, updated_at=NOW()
         RETURNING *`,
        [
          organizationId,
          businessTypeId,
          industryId,
          input.description || null,
          input.website || null,
          input.productsServices || null,
          input.expectedMonthlyVolumeMinor ?? null,
          input.averageTransactionMinor ?? null,
          input.volumeCurrencyCode || null,
        ],
      );
      const profileId = r.rows[0].id;

      if (input.countriesServed) {
        await client.query(`DELETE FROM business_profile_countries WHERE business_profile_id=$1`, [profileId]);
        for (const code of input.countriesServed) {
          const countryId = await resolveMasterId('master_countries', code, client);
          await client.query(
            `INSERT INTO business_profile_countries (organization_id, business_profile_id, country_id)
             VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
            [organizationId, profileId, countryId],
          );
        }
      }
      if (input.currenciesAccepted) {
        await client.query(`DELETE FROM business_profile_currencies WHERE business_profile_id=$1`, [profileId]);
        for (const code of input.currenciesAccepted) {
          const currencyId = await resolveMasterId('master_currencies', code, client);
          await client.query(
            `INSERT INTO business_profile_currencies (organization_id, business_profile_id, currency_id)
             VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
            [organizationId, profileId, currencyId],
          );
        }
      }

      await writeAuditEvent(
        {organizationId, actorUserId: actor.userId, action: 'merchant.business_profile.upsert', resourceType: 'business_profiles', resourceId: profileId, requestId: actor.requestId, after: r.rows[0]},
        client,
      );
      return r.rows[0];
    });
  },

  // ------------------------------------------------------------------- people

  async addPerson(
    kind: PersonKind,
    organizationId: string,
    input: {
      fullName: string;
      dateOfBirth?: string;
      nationalityCountryCode?: string;
      identificationTypeCode?: string;
      identificationNumber?: string;
      ownershipPercent?: string;
      isPep?: boolean;
      title?: string;
      roleTitle?: string;
      isSignatory?: boolean;
    },
    actor: Actor,
  ) {
    const table = PERSON_TABLES[kind];
    return withPgTransaction(async (client) => {
      await assertKybEditable(client, organizationId, actor);
      const nationalityId = input.nationalityCountryCode
        ? await resolveMasterId('master_countries', input.nationalityCountryCode, client)
        : null;
      const ident = await encryptIdentification(client, input);

      if (kind === 'owner') {
        // Serialize concurrent owner additions: the ownership-sum check below is
        // read-then-write, and assertKybEditable only locks when a case row exists.
        await client.query(`SELECT id FROM organizations WHERE id=$1 FOR UPDATE`, [organizationId]);
        const sum = await client.query<{total: string | null}>(
          `SELECT SUM(ownership_percent) AS total FROM beneficial_owners WHERE organization_id=$1 AND status='ACTIVE'`,
          [organizationId],
        );
        const total = Number(sum.rows[0]?.total || 0) + Number(input.ownershipPercent || 0);
        if (total > 100) {
          throw new AppError('OWNERSHIP_EXCEEDS_100', `Total beneficial ownership would be ${total}%`, 400);
        }
      }

      const cols = ['organization_id', 'full_name', 'date_of_birth', 'nationality_country_id', 'identification_type_id', 'identification_number_encrypted', 'identification_last4', 'identification_fingerprint'];
      const vals: unknown[] = [organizationId, input.fullName, input.dateOfBirth || null, nationalityId, ident.typeId, ident.encrypted, ident.last4, ident.fingerprint];
      if (kind === 'owner') {
        cols.push('ownership_percent', 'is_pep');
        vals.push(input.ownershipPercent, input.isPep ?? false);
      }
      if (kind === 'director') {
        cols.push('title');
        vals.push(input.title || null);
      }
      if (kind === 'representative') {
        cols.push('role_title', 'is_signatory');
        vals.push(input.roleTitle || null, input.isSignatory ?? false);
      }
      const r = await client.query(
        `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
        vals,
      );
      await writeAuditEvent(
        {organizationId, actorUserId: actor.userId, action: `merchant.${kind}.add`, resourceType: table, resourceId: r.rows[0].id, requestId: actor.requestId, after: maskPerson(r.rows[0])},
        client,
      );
      return maskPerson(r.rows[0]);
    });
  },

  async removePerson(kind: PersonKind, organizationId: string, personId: string, actor: Actor) {
    const table = PERSON_TABLES[kind];
    return withPgTransaction(async (client) => {
      await assertKybEditable(client, organizationId, actor);
      const r = await client.query(
        `UPDATE ${table} SET status='REMOVED', updated_at=NOW()
         WHERE id=$1 AND organization_id=$2 AND status='ACTIVE'
         RETURNING *`,
        [personId, organizationId],
      );
      if (!r.rows[0]) throw notFound('Person not found', 'PERSON_NOT_FOUND');
      await writeAuditEvent(
        {organizationId, actorUserId: actor.userId, action: `merchant.${kind}.remove`, resourceType: table, resourceId: personId, requestId: actor.requestId},
        client,
      );
      return maskPerson(r.rows[0]);
    });
  },
};

/**
 * KYB edit guard:
 *  - SUBMITTED / UNDER_REVIEW: merchant data is frozen (409).
 *  - APPROVED: edit allowed but the case is flagged back to UNDER_REVIEW
 *    (sensitive-change re-verification) — recorded in transitions + audit.
 *  - DRAFT / NEEDS_INFORMATION / no case: free editing.
 */
async function assertKybEditable(client: PgClient, organizationId: string, actor: Actor) {
  const r = await client.query<{id: string; status: string}>(
    `SELECT id, status FROM verification_cases
     WHERE organization_id=$1 AND case_type='KYB' AND status <> 'REJECTED'
     FOR UPDATE`,
    [organizationId],
  );
  const kase = r.rows[0];
  if (!kase) return;
  if (kase.status === 'SUBMITTED' || kase.status === 'UNDER_REVIEW') {
    throw new AppError('KYB_CASE_LOCKED', `Merchant data is locked while the KYB case is ${kase.status}`, 409);
  }
  if (kase.status === 'SUSPENDED') {
    throw new AppError('KYB_CASE_SUSPENDED', 'Organization is suspended; contact platform support', 409);
  }
  if (kase.status === 'APPROVED') {
    await flagDataChangedAfterApproval(client, kase.id, organizationId, actor.userId);
  }
}
