import React, {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import {v4} from '../api/endpoints';
import {ApiError, setSessionTransportHint, storeCsrfToken} from '../api/client';

export type AuthUser = {
  id: string;
  email: string;
};

export type AuthState = {
  token: string | null;
  user: AuthUser | null;
  organizationId: string | null;
  roles: string[];
  permissions: string[];
  accountType: 'platform' | 'merchant';
  isPlatform: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<{mfaRequired: boolean; mfaToken?: string}>;
  verifyMfa: (mfaToken: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  hasPermission: (...codes: string[]) => boolean;
};

const AuthContext = createContext<AuthState | null>(null);

/**
 * P15.2: Production dashboard must not persist session bearer tokens in localStorage.
 * - production / cookie mode: HttpOnly cookie + CSRF; memory-only token hint optional
 * - development dual: may keep localStorage for DX unless VITE_SESSION_TRANSPORT=cookie
 */
const TOKEN_KEY = 'v4_session_token';
const isProdBuild = import.meta.env.PROD === true || import.meta.env.MODE === 'production';
const sessionTransport = (
  import.meta.env.VITE_SESSION_TRANSPORT || (isProdBuild ? 'cookie' : 'dual')
).toLowerCase();
const useLocalStorageToken = sessionTransport === 'bearer' || sessionTransport === 'dual';
const cookieOnly = sessionTransport === 'cookie' || (isProdBuild && sessionTransport !== 'bearer');

setSessionTransportHint(sessionTransport);

function readStoredToken(): string | null {
  if (!useLocalStorageToken || cookieOnly) return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeStoredToken(token: string | null) {
  if (!useLocalStorageToken || cookieOnly) {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function AuthProvider({children}: {children: React.ReactNode}) {
  const [token, setToken] = useState<string | null>(() => readStoredToken());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [accountType, setAccountType] = useState<'platform' | 'merchant'>('merchant');
  const [loading, setLoading] = useState(true);

  const applySession = useCallback(async (sessionToken: string | null) => {
    const me = await v4.me(sessionToken);
    // In cookie mode, token may be null — auth rides on HttpOnly cookie + credentials include.
    if (sessionToken && !cookieOnly) {
      setToken(sessionToken);
      writeStoredToken(sessionToken);
    } else {
      setToken(sessionToken || 'cookie-session');
      writeStoredToken(null);
    }
    if (me.csrf_token) storeCsrfToken(me.csrf_token);
    setUser(me.user);
    setOrganizationId(me.organization_id || null);
    setRoles(me.roles || []);
    setPermissions(me.permissions || []);
    setAccountType(me.account_type === 'platform' ? 'platform' : 'merchant');
  }, []);

  const refresh = useCallback(async () => {
    try {
      await applySession(cookieOnly ? null : token);
    } catch {
      writeStoredToken(null);
      setToken(null);
      setUser(null);
      setOrganizationId(null);
      setRoles([]);
      setPermissions([]);
      setAccountType('merchant');
    } finally {
      setLoading(false);
    }
  }, [token, applySession]);

  useEffect(() => {
    void refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- boot once

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await v4.login({email, password});
      if (result.mfa_required || result.mfa_token) {
        return {mfaRequired: true, mfaToken: result.mfa_token as string};
      }
      if (result.csrf_token) storeCsrfToken(result.csrf_token);
      const sessionToken = result.access_token || result.token || result.session_token || null;
      if (!sessionToken && !cookieOnly && result.token_delivery !== 'cookie') {
        throw new ApiError('Login succeeded without session token', {status: 500});
      }
      await applySession(sessionToken);
      return {mfaRequired: false};
    },
    [applySession],
  );

  const verifyMfa = useCallback(
    async (mfaToken: string, code: string) => {
      const result = await v4.mfaVerify({mfa_token: mfaToken, totp: code});
      if (result.csrf_token) storeCsrfToken(result.csrf_token);
      const sessionToken = result.access_token || result.token || result.session_token || null;
      if (!sessionToken && !cookieOnly && result.token_delivery !== 'cookie') {
        throw new ApiError('MFA succeeded without session token', {status: 500});
      }
      await applySession(sessionToken);
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    try {
      await v4.logout(cookieOnly ? null : token);
    } catch {
      /* ignore */
    }
    writeStoredToken(null);
    try {
      sessionStorage.removeItem('v4_csrf_token');
    } catch {
      /* ignore */
    }
    setToken(null);
    setUser(null);
    setOrganizationId(null);
    setRoles([]);
    setPermissions([]);
    setAccountType('merchant');
  }, [token]);

  const hasPermission = useCallback(
    (...codes: string[]) => {
      if (!codes.length) return true;
      if (permissions.includes('platform.admin')) return true;
      return codes.some((c) => permissions.includes(c));
    },
    [permissions],
  );

  const value = useMemo(
    () => ({
      token: cookieOnly ? (user ? 'cookie-session' : null) : token,
      user,
      organizationId,
      roles,
      permissions,
      accountType,
      isPlatform: accountType === 'platform',
      loading,
      login,
      verifyMfa,
      logout,
      refresh,
      hasPermission,
    }),
    [token, user, organizationId, roles, permissions, accountType, loading, login, verifyMfa, logout, refresh, hasPermission],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth requires AuthProvider');
  return ctx;
}
