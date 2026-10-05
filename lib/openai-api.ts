export class OpenAIRequestError extends Error {
  status: number;
  constructor(message: string, status = 502) { super(message); this.status = status; }
}

// Never relay raw provider errors: authentication errors can contain key fragments.
export function openAIError(status: number, code?: string) {
  if (status === 401) return new OpenAIRequestError('OpenAI rejected this API key. Update it in AI settings.', 401);
  if (status === 403) return new OpenAIRequestError('This key does not have permission for this OpenAI request. Check its project and permissions.', 403);
  if (status === 429 && code === 'insufficient_quota') return new OpenAIRequestError('Your OpenAI API account needs available credits or a higher spending limit. Check OpenAI billing.', 429);
  if (status === 429) return new OpenAIRequestError('OpenAI is rate-limiting requests. Wait a moment and try again.', 429);
  if (status === 404 || code === 'model_not_found') return new OpenAIRequestError('This OpenAI model is unavailable for your key. Choose another model in AI settings.', 400);
  if (status === 400) return new OpenAIRequestError('OpenAI could not accept this request. Check the selected model or try a shorter passage.', 400);
  return new OpenAIRequestError('OpenAI is unavailable right now. Please try again.');
}

async function requestOpenAI(key: string, path: 'models' | 'responses', body?: unknown, fetcher: typeof fetch = fetch) {
  try {
    const response = await fetcher(`https://api.openai.com/v1/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {Authorization: `Bearer ${key}`, 'Content-Type': 'application/json'},
      ...(body ? {body: JSON.stringify(body)} : {}),
      signal: AbortSignal.timeout(body ? 90000 : 20000),
      redirect: 'error',
    });
    const data = await response.json() as {error?: {code?: string}};
    if (!response.ok) throw openAIError(response.status, data.error?.code);
    return data;
  } catch (error) {
    if (error instanceof OpenAIRequestError) throw error;
    if (error instanceof Error && /timeout|abort/i.test(error.name)) throw new OpenAIRequestError('OpenAI took too long to respond. Nothing was changed; try again.', 504);
    throw new OpenAIRequestError('Could not reach OpenAI. Please try again.');
  }
}

export function textModels(data: unknown): string[] {
  const entries = (data as {data?: {id?: string}[]})?.data;
  if (!Array.isArray(entries)) return [];
  const preferred = ['gpt-6-sol', 'gpt-6-astra', 'gpt-5.4', 'gpt-5.2', 'gpt-4.1'];
  const ids = entries.map(item => item.id).filter((id): id is string => typeof id === 'string' && /^gpt-[4-9][a-z0-9.-]*$/i.test(id) && !/audio|realtime|image|transcrib|search|computer|instruct|deep-research|tts|diariz/i.test(id));
  return [...new Set(ids)].sort((a, b) => {
    const rank = (id: string) => preferred.includes(id) ? preferred.indexOf(id) : preferred.length;
    return rank(a) - rank(b) || b.localeCompare(a, undefined, {numeric: true});
  });
}
export async function listOpenAIModels(key: string, fetcher: typeof fetch = fetch) {
  const models = textModels(await requestOpenAI(key, 'models', undefined, fetcher));
  if (!models.length) throw new OpenAIRequestError('No supported text models are available for this key. Check your OpenAI project access.', 400);
  return models;
}

export function openAIText(data: unknown) {
  const response = data as {status?: string; output?: {type?: string; content?: {type?: string; text?: string}[]}[]};
  if (response.status !== 'completed') throw new OpenAIRequestError('OpenAI did not finish the response. Nothing was changed; please try again.');
  const text = (response.output || []).filter(item => item.type === 'message').flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text || '').join('');
  if (!text.trim()) throw new OpenAIRequestError('OpenAI returned no text for this request. Try another action or revise the prompt.');
  return text; // Preserve whitespace for exact caret insertion.
}
export async function generateWithOpenAI(key: string, model: string, prompt: string, fetcher: typeof fetch = fetch) {
  if (!prompt.trim() || prompt.length > 24000) throw new OpenAIRequestError('Use a passage between 1 and 24,000 characters.', 400);
  return openAIText(await requestOpenAI(key, 'responses', {model, input: prompt, max_output_tokens: 8192, store: false}, fetcher));
}
