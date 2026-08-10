import type {FastifyInstance} from 'fastify';
import {currentTotp} from '../../apps/api/src/foundation/crypto.js';

/** Enable MFA (if needed) and return a fresh step-up token for the session. */
export async function issueStepUpToken(
  app: FastifyInstance,
  bearerToken: string,
  purpose = 'SENSITIVE',
): Promise<string> {
  const enable = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/mfa/enable',
    headers: {authorization: `Bearer ${bearerToken}`},
  });
  let secret = enable.json()?.data?.secret as string | undefined;
  if (enable.statusCode !== 200 || !secret) {
    throw new Error(`Unable to enable MFA for step-up: ${enable.statusCode} ${JSON.stringify(enable.json())}`);
  }
  const step = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/mfa/step-up',
    headers: {authorization: `Bearer ${bearerToken}`},
    payload: {totp: currentTotp(secret), purpose},
  });
  if (step.statusCode !== 200) {
    throw new Error(`step-up failed: ${step.statusCode} ${JSON.stringify(step.json())}`);
  }
  return step.json().data.step_up_token as string;
}
