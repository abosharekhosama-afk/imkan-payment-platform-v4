import React from 'react';
import {useAuth} from '../auth/AuthProvider';

/** UX-only permission gate. Backend RBAC remains authoritative. */
export function Can({
  anyOf,
  children,
  fallback = null,
}: {
  anyOf: string[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const {hasPermission} = useAuth();
  if (!hasPermission(...anyOf)) return <>{fallback}</>;
  return <>{children}</>;
}
