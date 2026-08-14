const KEY = 'v4_access_block';

export type AccessBlock = {
  kind: 'restricted' | 'closed';
  organization_name?: string | null;
  support_email?: string | null;
  support_phone?: string | null;
};

export function isAccessBlockCode(code?: string) {
  return (
    code === 'MEMBERSHIP_RESTRICTED' ||
    code === 'MEMBERSHIP_CLOSED' ||
    code === 'ACCOUNT_DISABLED'
  );
}

export function storeAccessBlock(block: AccessBlock) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(block));
  } catch {
    /* ignore */
  }
}

export function readAccessBlock(): AccessBlock | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AccessBlock;
  } catch {
    return null;
  }
}

export function clearAccessBlock() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function accessBlockFromError(err: {code?: string; details?: unknown}): AccessBlock | null {
  if (!isAccessBlockCode(err.code)) return null;
  const details = (err.details || {}) as Record<string, unknown>;
  const kind =
    err.code === 'MEMBERSHIP_CLOSED' || details.kind === 'closed' ? 'closed' : 'restricted';
  return {
    kind,
    organization_name: (details.organization_name as string) || null,
    support_email: (details.support_email as string) || null,
    support_phone: (details.support_phone as string) || null,
  };
}
