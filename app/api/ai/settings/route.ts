import {z} from 'zod';
import {database} from '@/db/storage';
import {authorizeAI, aiBody, aiJSON, aiFailure, connectionFor, publicConnection, encryptionSecret} from '@/db/ai-connections';
import {encryptAIKey} from '@/lib/ai-key-crypto';
import {listOpenAIModels, OpenAIRequestError} from '@/lib/openai-api';

export async function GET(request: Request) {
  try {return aiJSON(publicConnection(await connectionFor(authorizeAI(request))));} catch (error) {return aiFailure(error);}
}
// Adding/replacing a key is separate from switching providers. Switching never deletes a key or signs out of Puter.
export async function PUT(request: Request) {
  try {
    const user = authorizeAI(request, true);
    const body = z.object({key: z.string().trim().min(20).max(512).regex(/^sk-[A-Za-z0-9_-]+$/)}).strict().safeParse(await aiBody(request, 1024));
    if (!body.success) throw new OpenAIRequestError('Enter a valid OpenAI API key beginning with sk-.', 400);
    const secret = encryptionSecret();
    const previous = await connectionFor(user);
    if (previous && previous.request_until > Date.now()) throw new OpenAIRequestError('Wait for the current AI request to finish.', 409);
    const models = await listOpenAIModels(body.data.key);
    const encrypted = await encryptAIKey(body.data.key, user, secret);
    const model = previous && models.includes(previous.model) ? previous.model : models[0];
    const saved = await database().prepare(`INSERT INTO ai_connections (user_id, provider, encrypted_key, last_four, model, models)
      VALUES (?, 'openai', ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET provider='openai', encrypted_key=excluded.encrypted_key, last_four=excluded.last_four, model=excluded.model, models=excluded.models
      WHERE ai_connections.request_until <= ?`).bind(user, encrypted, body.data.key.slice(-4), model, JSON.stringify(models), Date.now()).run();
    if (!saved.meta.changes) throw new OpenAIRequestError('Wait for the current AI request to finish.', 409);
    return aiJSON(publicConnection(await connectionFor(user)));
  } catch (error) {return aiFailure(error);}
}
export async function PATCH(request: Request) {
  try {
    const user = authorizeAI(request, true);
    const body = z.object({provider: z.enum(['puter', 'openai']).optional(), model: z.string().max(128).optional()}).strict().safeParse(await aiBody(request, 1024));
    if (!body.success) throw new OpenAIRequestError('Invalid AI settings.', 400);
    const row = await connectionFor(user);
    if (!row) {
      if (body.data.provider === 'puter' && !body.data.model) return aiJSON(publicConnection(null));
      throw new OpenAIRequestError('Add your OpenAI key in AI settings first.', 400);
    }
    if (body.data.provider === 'openai' && !row.encrypted_key) throw new OpenAIRequestError('Add your OpenAI key first.', 400);
    if (body.data.model && !(JSON.parse(row.models) as string[]).includes(body.data.model)) throw new OpenAIRequestError('Choose an available OpenAI model.', 400);
    const result = await database().prepare('UPDATE ai_connections SET provider=?, model=? WHERE user_id=? AND request_until<=?').bind(body.data.provider || row.provider, body.data.model || row.model, user, Date.now()).run();
    if (!result.meta.changes) throw new OpenAIRequestError('Wait for the current AI request to finish.', 409);
    return aiJSON(publicConnection(await connectionFor(user)));
  } catch (error) {return aiFailure(error);}
}
export async function DELETE(request: Request) {
  try {
    const user = authorizeAI(request, true);
    const result = await database().prepare("UPDATE ai_connections SET provider='puter', encrypted_key=NULL, last_four=NULL, model='', models='[]' WHERE user_id=? AND request_until<=?").bind(user, Date.now()).run();
    if (!result.meta.changes && (await connectionFor(user))?.encrypted_key) throw new OpenAIRequestError('Wait for the current AI request to finish.', 409);
    return aiJSON(publicConnection(await connectionFor(user)));
  } catch (error) {return aiFailure(error);}
}
