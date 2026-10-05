export type AIModel = {id: string; name?: string; provider?: string};
export type PuterSDK = {
  auth: {isSignedIn(): boolean; signIn(options?: {attempt_temp_user_creation: boolean}): Promise<unknown>; signOut(): void | Promise<unknown>};
  ai: {listModels(): Promise<AIModel[]>; chat(prompt: string, options: {model: string; max_tokens: number; normalize: boolean}): Promise<unknown>};
};
declare global { interface Window { puter?: PuterSDK } }
let loading: Promise<PuterSDK> | undefined;

// Load only when the user opens an AI panel. Never send workspace data on load.
export function loadPuter(): Promise<PuterSDK> {
  if (window.puter) return Promise.resolve(window.puter);
  if (loading) return loading;
  loading = new Promise<PuterSDK>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://js.puter.com/v2/';
    script.async = true;
    const timer = setTimeout(() => fail(), 20000);
    function fail() { clearTimeout(timer); script.remove(); reject(new Error('Puter could not load. Check your connection or content blocker, then retry.')); }
    script.onerror = fail;
    script.onload = () => { clearTimeout(timer); if (window.puter) resolve(window.puter); else fail(); };
    document.head.appendChild(script);
  }).catch(error => { loading = undefined; throw error; });
  return loading;
}

export function advancedModels(models: AIModel[]): AIModel[] {
  return [...new Map(models.filter(m => typeof m.id === 'string' &&
    /claude.*(sonnet|opus)|gemini.*pro/i.test(m.id) &&
    !/image|vision|audio|thinking|:|preview|experimental/i.test(m.id)
  ).map(m => [m.id, m])).values()].sort((a, b) => {
    const rank = (id: string) => /claude.*sonnet/i.test(id) ? 0 : /claude.*opus/i.test(id) ? 1 : 2;
    return rank(a.id) - rank(b.id) || b.id.localeCompare(a.id, undefined, {numeric: true});
  });
}

export function responseText(response: unknown): string {
  if (typeof response === 'string') return response;
  const r = response as {message?: {content?: unknown}; error?: unknown; success?: boolean} | null;
  if (r?.success === false || r?.error) throw new Error('Puter did not complete this request. Check your allowance and try again.');
  const content = r?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.filter(b => b?.type === 'text' && typeof b.text === 'string').map(b => b.text).join('\n');
  return '';
}

// Puter.js handles an existing browser session and any needed auth during the
// AI call. isSignedIn() is only a status hint; it must not block a valid token.
export async function chatWithPuter(client: PuterSDK, prompt: string, model: string): Promise<string> {
  const result = responseText(await client.ai.chat(prompt, {model, max_tokens: 2048, normalize: true}));
  if (!result.trim()) throw new Error('The model returned no text. Try a clearer prompt or choose another model.');
  return result;
}

export function puterError(error: unknown): string {
  const e = error as {message?: string; msg?: string; code?: string; error?: string | {message?: string; code?: string}} | null;
  const nested = typeof e?.error === 'object' ? e.error : undefined;
  const message = String(e?.message || e?.msg || nested?.message || nested?.code || e?.code || e?.error || 'The request failed. Please try again.');
  if (/popup.blocked/i.test(message)) return 'Allow pop-ups for Luma, then click Sign in with Puter again.';
  if (/auth_window_closed|cancel/i.test(message)) return 'Sign-in was cancelled. Nothing was sent.';
  if (/allowance|credit|balance|quota|payment|usage.limit/i.test(message)) return 'Your Puter allowance may be exhausted. Check usage in Puter. Luma has not purchased credits or upgraded your account.';
  return message.slice(0, 400);
}
