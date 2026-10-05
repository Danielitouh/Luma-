import {env} from 'cloudflare:workers';
import {database, userId, sameOrigin} from './storage';
import type {AIConnection} from '@/lib/ai-provider';
import {OpenAIRequestError} from '@/lib/openai-api';

export type ConnectionRow = {user_id: string; provider: 'puter' | 'openai'; encrypted_key: string | null; last_four: string | null; model: string; models: string; request_token: string | null; request_until: number};
export const secureStorageAvailable = () => /^[a-f0-9]{64}$/i.test(env.LUMA_AI_ENCRYPTION_KEY || '');
export function encryptionSecret() {
  if (!secureStorageAvailable()) throw new OpenAIRequestError('Secure key storage is unavailable. Please try again later.', 503);
  return env.LUMA_AI_ENCRYPTION_KEY!;
}
export function authorizeAI(request: Request, mutate = false) {
  const user = userId(request);
  if (!user) throw new OpenAIRequestError('Sign in to Luma to manage your AI connection.', 401);
  if (mutate && (!sameOrigin(request) || request.headers.get('sec-fetch-site') === 'cross-site' || request.headers.get('x-luma-ai') !== '1')) throw new OpenAIRequestError('Invalid request origin. Reload Luma and try again.', 403);
  return user;
}
export async function connectionFor(user: string) {
  return database().prepare('SELECT * FROM ai_connections WHERE user_id=?').bind(user).first<ConnectionRow>();
}
export function publicConnection(row: ConnectionRow | null): AIConnection {
  return {provider: row?.provider || 'puter', hasKey: !!row?.encrypted_key, lastFour: row?.last_four || '', model: row?.model || '', models: JSON.parse(row?.models || '[]'), secureStorageAvailable: secureStorageAvailable()};
}
export function aiJSON(body: unknown, status = 200) { return Response.json(body, {status, headers: {'Cache-Control': 'no-store', 'Vary': 'Cookie'}}); }
export function aiFailure(error: unknown) {
  if (error instanceof OpenAIRequestError) return aiJSON({error: error.message}, error.status);
  // Do not log request bodies, ciphertext, keys, or provider error payloads.
  console.error('Luma AI operation failed');
  return aiJSON({error: 'Your AI connection could not be updated or used. Please try again.'}, 503);
}
export async function aiBody(request: Request, max: number) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new OpenAIRequestError('Expected a JSON request.', 400);
  const text = await request.text();
  if (text.length > max) throw new OpenAIRequestError('The request is too large.', 413);
  try {return JSON.parse(text) as unknown;} catch {throw new OpenAIRequestError('The request was not readable. Please try again.', 400);}
}
