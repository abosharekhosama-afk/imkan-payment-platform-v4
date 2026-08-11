import {useEffect, useState} from 'react';
import {v4} from '../api/endpoints';

export type MasterOption = {code: string; name: string};

/** Loads active master-data rows for select inputs. */
export function useMasterOptions(token: string | null | undefined, type: string) {
  const [options, setOptions] = useState<MasterOption[]>([]);
  const [loading, setLoading] = useState(Boolean(token));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    v4.masterData(token, type)
      .then((rows) => {
        if (cancelled) return;
        setOptions(
          (rows || []).map((r: any) => ({
            code: String(r.code),
            name: String(r.name || r.code),
          })),
        );
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Failed to load master data');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, type]);

  return {options, loading, error};
}
