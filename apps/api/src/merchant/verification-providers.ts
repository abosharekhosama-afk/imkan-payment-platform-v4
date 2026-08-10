/**
 * Phase 3 provider adapter boundaries for KYB / business verification and
 * bank-account verification.
 *
 * NO external provider API is invented here (spec §2/§13). Until a real
 * provider integration is approved and documented, the internal adapter
 * returns NOT_AVAILABLE and decisions are made by platform manual review.
 */

export type ProviderCheckResult = {
  checkType: string;
  result: 'PASS' | 'FAIL' | 'WARN' | 'PENDING' | 'NOT_AVAILABLE';
  provider: string;
  details?: Record<string, unknown>;
};

export interface KybVerificationProvider {
  readonly name: string;
  verifyCompany(input: {
    organizationId: string;
    legalName: string;
    registrationNumber?: string | null;
    countryCode?: string | null;
  }): Promise<ProviderCheckResult>;
  verifyPerson(input: {
    organizationId: string;
    fullName: string;
    identificationLast4?: string | null;
  }): Promise<ProviderCheckResult>;
}

export interface BankVerificationProvider {
  readonly name: string;
  verifyAccount(input: {
    organizationId: string;
    payoutAccountId: string;
    accountHolderName: string;
    accountLast4: string;
    countryCode: string;
    currencyCode: string;
  }): Promise<ProviderCheckResult>;
}

class InternalManualKybProvider implements KybVerificationProvider {
  readonly name = 'internal-manual';

  async verifyCompany(): Promise<ProviderCheckResult> {
    return {
      checkType: 'EXTERNAL_COMPANY_VERIFICATION',
      result: 'NOT_AVAILABLE',
      provider: this.name,
      details: {note: 'No external KYB provider integrated; manual platform review required.'},
    };
  }

  async verifyPerson(): Promise<ProviderCheckResult> {
    return {
      checkType: 'EXTERNAL_PERSON_VERIFICATION',
      result: 'NOT_AVAILABLE',
      provider: this.name,
      details: {note: 'No external person-verification provider integrated; manual platform review required.'},
    };
  }
}

class InternalManualBankProvider implements BankVerificationProvider {
  readonly name = 'internal-manual';

  async verifyAccount(): Promise<ProviderCheckResult> {
    return {
      checkType: 'EXTERNAL_BANK_VERIFICATION',
      result: 'NOT_AVAILABLE',
      provider: this.name,
      details: {note: 'No external bank-verification provider integrated; manual platform review required.'},
    };
  }
}

export const kybVerificationProvider: KybVerificationProvider = new InternalManualKybProvider();
export const bankVerificationProvider: BankVerificationProvider = new InternalManualBankProvider();
