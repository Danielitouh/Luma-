import {z} from 'zod';
import {database} from '@/db/storage';
import {authorizeAI, aiBody, aiJSON, aiFailure, connectionFor, encryptionSecret} from '@/db/ai-connections';
import {decryptAIKey} from '@/lib/ai-key-crypto';
import {generateWithOpenAI, OpenAIRequestError} from '@/lib/openai-api';

export async function POST(request: Request) {
  let owner: string | undefined;
  let token: string | undefined;
  try {
    owner = authorizeAI(request, true);
    const body = z.object({prompt: z.string().min(1).max(24000), model: z.string().min(1).max(128)}).strict().safeParse(await aiBody(request, 150000));
    if (!body.success) throw new OpenAIRequestError('Use a passage under 24,000 characters.', 400);
    const row = await connectionFor(owner);
    if (!row?.encrypted_key) throw new OpenAIRequestError('Add your OpenAI API key in AI settings first.', 400);
    if (row.provider !== 'openai') throw new OpenAIRequestError('Your provider changed. Select OpenAI in AI settings and try again.', 409);
    if (!(JSON.parse(row.models) as string[]).includes(body.data.model)) throw new OpenAIRequestError('Choose an available OpenAI model in AI settings.', 400);
    const requestToken = crypto.randomUUID();
    const acquired = await database().prepare("UPDATE ai_connections SET request_token=?, request_until=? WHERE user_id=? AND provider='openai' AND encrypted_key=? AND request_until<=?").bind(requestToken, Date.now() + 120000, owner, row.encrypted_key, Date.now()).run();
    if (!acquired.meta.changes) throw new OpenAIRequestError('Another AI request is running or your settings changed. Please try again in a moment.', 409);
    token = requestToken;
    const key = await decryptAIKey(row.encrypted_key, owner, encryptionSecret());
    return aiJSON({text: await generateWithOpenAI(key, body.data.model, body.data.prompt)});
  } catch (error) {return aiFailure(error);}
  finally {
    if (owner && token) {
      try {await database().prepare('UPDATE ai_connections SET request_token=NULL, request_until=0 WHERE user_id=? AND request_token=?').bind(owner, token).run();}
      catch {console.error('Luma AI request lock could not be released');}
    }
  }
}
