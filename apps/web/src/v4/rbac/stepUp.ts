import {v4} from '../api/endpoints';
import {ApiError} from '../api/client';

/** Obtain a step-up token; enrolls MFA if missing and returns secret for one-time display. */
export async function obtainStepUp(
  token: string | null,
  totp: string,
): Promise<{stepUpToken?: string; mfaSecret?: string; enrolled?: boolean}> {
  try {
    const step = await v4.stepUp(token, totp);
    return {stepUpToken: step.step_up_token as string};
  } catch (err) {
    const code = err instanceof ApiError ? err.code : '';
    if (code === 'MFA_REQUIRED_FOR_STEP_UP' || /MFA must be enabled/i.test(String((err as Error).message))) {
      const enabled = await v4.enableMfa(token);
      return {enrolled: true, mfaSecret: enabled.secret as string};
    }
    throw err;
  }
}
