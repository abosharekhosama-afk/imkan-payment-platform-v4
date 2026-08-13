type TFn = (key: string, params?: Record<string, string | number>) => string;

const REQUIREMENT_FALLBACK_EN: Record<string, string> = {
  KYB_LEGAL_PROFILE_REQUIRED: 'Complete legal profile',
  KYB_BUSINESS_PROFILE_REQUIRED: 'Complete business profile',
  KYB_REGISTERED_ADDRESS_REQUIRED: 'Add registered address',
  KYB_MIN_PERSONS: 'Add at least one owner, director, or representative',
  KYB_OWNERSHIP_TOTAL_MAX: 'Total ownership must not exceed 100%',
  KYB_DOC_COMPANY_REGISTRATION: 'Upload company registration certificate',
};

const DOC_TYPE_FALLBACK_EN: Record<string, string> = {
  COMPANY_REGISTRATION: 'Company registration certificate',
  BUSINESS_LICENSE: 'Business license',
  ARTICLES_OF_ASSOCIATION: 'Articles of association',
  TAX_CERTIFICATE: 'Tax certificate',
  VAT_CERTIFICATE: 'VAT certificate',
  OWNER_ID: 'Owner ID document',
  REPRESENTATIVE_AUTHORIZATION: 'Representative authorization',
  PROOF_OF_ADDRESS: 'Proof of address',
  BANK_LETTER: 'Bank letter',
  BANK_STATEMENT: 'Bank statement',
};

export function kybRequirementLabel(code: string, t: TFn): string {
  const key = `kyb.requirement.${code}`;
  const translated = t(key);
  if (translated !== key) return translated;
  return REQUIREMENT_FALLBACK_EN[code] || code.replace(/^KYB_/, '').replace(/_/g, ' ').toLowerCase();
}

export function documentTypeLabel(code: string, t: TFn): string {
  if (!code) return '—';
  const key = `docType.${code}`;
  const translated = t(key);
  if (translated !== key) return translated;
  return DOC_TYPE_FALLBACK_EN[code] || code.replace(/_/g, ' ').toLowerCase();
}

export function kybRequirementTypeLabel(type: string, t: TFn): string {
  const key = `kyb.requirementType.${type}`;
  const translated = t(key);
  if (translated !== key) return translated;
  return type.replace(/_/g, ' ').toLowerCase();
}
