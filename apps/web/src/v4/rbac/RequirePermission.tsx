import React from 'react';
import {Navigate} from 'react-router-dom';
import {useAuth} from '../auth/AuthProvider';
import {ImkanLoader} from '../components/ImkanLoader';

/** Route-level UX gate. Backend remains authoritative. */
export function RequirePermission({
  anyOf,
  children,
}: {
  anyOf: string[];
  children: React.ReactNode;
}) {
  const {token, loading, hasPermission} = useAuth();
  if (loading) return <ImkanLoader overlay label="Checking access…" />;
  if (!token) return <Navigate to="/login" replace />;
  if (!hasPermission(...anyOf)) return <Navigate to="/forbidden" replace />;
  return <>{children}</>;
}
