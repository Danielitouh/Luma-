'use client';
import {useCallback, useEffect, useRef, useState} from 'react';
import {Loader2, Sparkles} from 'lucide-react';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {advancedModels, chatWithPuter, loadPuter, puterError, type AIModel, type PuterSDK} from '@/lib/puter';

export function usePuter(active: boolean) {
  const [sdk, setSdk] = useState<PuterSDK>();
  const [models, setModels] = useState<AIModel[]>([]);
  const [model, setModel] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const initializing = useRef<Promise<{client: PuterSDK; list: AIModel[]}> | null>(null);
  const requestActive = useRef(false);
  const initialize = useCallback(() => {
    if (initializing.current) return initializing.current;
    setLoading(true); setError('');
    const pending = (async () => {
      try {
        const client = await loadPuter(); setSdk(client); setSignedIn(previous => previous || client.auth.isSignedIn());
        const list = advancedModels(await client.ai.listModels());
        if (!list.length) throw new Error('No supported advanced models are available from Puter right now. Retry later.');
        setModels(list); setModel(previous => list.some(m => m.id === previous) ? previous : list[0].id);
        return {client, list};
      } catch (e) { setError(puterError(e)); throw e; }
      finally { initializing.current = null; setLoading(false); }
    })();
    initializing.current = pending;
    return pending;
  }, []);
  useEffect(() => { if (active && !sdk) void initialize().catch(() => {}); }, [active, sdk, initialize]);
  useEffect(() => {
    // A focus event can arrive before Puter finishes restoring its session.
    // Keep the confirmed connection until an explicit sign-out or auth failure.
    const refresh = () => { if (sdk?.auth.isSignedIn()) setSignedIn(true); };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [sdk]);
  async function signIn() {
    if (!sdk || signingIn) return;
    setSigningIn(true); setError('');
    try { await sdk.auth.signIn({attempt_temp_user_creation: false}); setSignedIn(true); }
    catch (e) { setError(puterError(e)); }
    finally { setSigningIn(false); }
  }
  async function signOut() {
    if (!sdk || busy) return;
    try { await sdk.auth.signOut(); setSignedIn(false); setError(''); }
    catch (e) { setError(puterError(e)); }
  }
  async function generate(prompt: string) {
    if (requestActive.current) throw new Error('A request is still running. Please wait before sending another.');
    if (prompt.length > 24000) throw new Error('This passage is too long. Use a shorter block (under 24,000 characters).');
    requestActive.current = true; setBusy(true); setError('');
    // No retries or model substitutions: each click makes at most one AI request.
    try {
      const {client, list} = sdk && models.length ? {client: sdk, list: models} : await initialize();
      const selectedModel = list.some(m => m.id === model) ? model : list[0].id;
      const result = await chatWithPuter(client, prompt, selectedModel);
      setSignedIn(true);
      return result;
    } catch (e) {
      if (/unauthorized|unauthenticated|invalid.token|expired.token|authentication.required/i.test(puterError(e))) setSignedIn(false);
      throw e;
    } finally { requestActive.current = false; setBusy(false); }
  }
  return {models, model, setModel, signedIn, loading, signingIn, busy, error, initialize, signIn, signOut, generate, ready: !!sdk};
}
type Client = ReturnType<typeof usePuter>;

export function PuterConnection({client}: {client: Client}) {
  return <div className="puter-controls">
    <label className="handoff-label">Advanced model
      <Select value={client.model} onValueChange={client.setModel} disabled={client.loading || client.busy || !client.models.length}>
        <SelectTrigger aria-label="Advanced AI model"><SelectValue placeholder="Loading available models…"/></SelectTrigger>
        <SelectContent>{client.models.map(m => <SelectItem key={m.id} value={m.id}>{m.name || m.id}</SelectItem>)}</SelectContent>
      </Select>
    </label>
    {client.loading && <p role="status">Loading Puter and its model list…</p>}
    {client.signedIn ? <div className="puter-account"><span>Signed in to Puter</span><button className="text-button" disabled={client.busy} onClick={() => void client.signOut()}>Disconnect</button></div> : <button className="primary" disabled={!client.ready || client.signingIn || client.loading} onClick={() => void client.signIn()}>{client.signingIn ? <Loader2 className="spin" size={16}/> : <Sparkles size={16}/>} {client.signingIn ? 'Complete sign-in in the pop-up…' : 'Sign in with Puter'}</button>}
    {client.error && <div className="ai-error" role="alert">{client.error}<button className="text-button" disabled={client.loading} onClick={() => void client.initialize().catch(() => {})}>Retry connection</button></div>}
    <a className="text-button" href="https://puter.com/" target="_blank" rel="noopener noreferrer">Manage account and usage in Puter ↗</a>
  </div>;
}
