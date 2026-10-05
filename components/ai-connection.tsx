'use client';
import {useCallback, useEffect, useRef, useState} from 'react';
import {Loader2, Check} from 'lucide-react';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {usePuter, PuterConnection} from './puter-ai';
import {puterError} from '@/lib/puter';
import {providerGenerator, type AIConnection, type AIProvider} from '@/lib/ai-provider';

async function aiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {response = await fetch(path, {...init, cache: 'no-store', headers: {'Content-Type': 'application/json', 'X-Luma-AI': '1', ...init?.headers}});}
  catch {throw new Error('Could not connect to Luma. Check your connection and try again.');}
  let body: T & {error?: string};
  try {body = await response.json();} catch {throw new Error('Luma could not complete this request. Reload the page and try again.');}
  if (!response.ok) throw new Error(body.error || 'The AI request failed. Please try again.');
  return body;
}

export function useAIConnection(active: boolean, actionRunning: () => boolean) {
  const [settings, setSettings] = useState<AIConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const settingsRef = useRef<AIConnection | null>(null);
  const loadRef = useRef<Promise<AIConnection> | null>(null);
  const saveActive = useRef(false);
  const generationActive = useRef(false);
  // Keep this hook mounted for the lifetime of Luma. Provider changes never sign out or reset Puter.
  const puter = usePuter(active && settings?.provider === 'puter');
  const acceptSettings = useCallback((next: AIConnection) => {settingsRef.current = next; setSettings(next);}, []);
  const load = useCallback(() => {
    if (loadRef.current) return loadRef.current;
    setLoading(true); setError('');
    const pending = aiFetch<AIConnection>('/api/ai/settings').then(next => {acceptSettings(next); return next;}).catch(error => {setError((error as Error).message); throw error;}).finally(() => {setLoading(false); loadRef.current = null;});
    loadRef.current = pending;
    return pending;
  }, [acceptSettings]);
  useEffect(() => {void load().catch(() => {});}, [load]);

  async function update(method: 'PUT' | 'PATCH' | 'DELETE', body?: object) {
    if (saveActive.current || generationActive.current || actionRunning()) throw new Error('Wait for the current AI request to finish.');
    saveActive.current = true; setSaving(true); setError('');
    try {
      const next = await aiFetch<AIConnection>('/api/ai/settings', {method, ...(body ? {body: JSON.stringify(body)} : {})});
      acceptSettings(next); return next;
    } catch (error) {setError((error as Error).message); throw error;}
    finally {saveActive.current = false; setSaving(false);}
  }
  // This function belongs to the render where the action began. Multi-step pet
  // actions keep using that provider/model even if another render happens.
  const snapshot = settings;
  async function generate(prompt: string) {
    if (generationActive.current || saveActive.current) throw new Error('An AI request or settings change is still running. Please wait.');
    generationActive.current = true; setBusy(true);
    try {
      const selected = snapshot || settingsRef.current || await load();
      const generate = providerGenerator(selected.provider, async text => {
        try {return await puter.generate(text);} catch (error) {throw new Error(puterError(error));}
      }, async text => {
        if (!selected.hasKey) throw new Error('Add your OpenAI API key in AI settings first.');
        return (await aiFetch<{text: string}>('/api/ai/generate', {method: 'POST', body: JSON.stringify({prompt: text, model: selected.model})})).text;
      });
      return await generate(prompt);
    } finally {generationActive.current = false; setBusy(false);}
  }
  return {settings, loading, saving, busy: busy || puter.busy, error, puter, load, update, generate};
}

export function AIConnectionSettings({client, locked}: {client: ReturnType<typeof useAIConnection>; locked: boolean}) {
  const [tab, setTab] = useState<AIProvider>(client.settings?.provider || 'puter');
  const [key, setKey] = useState('');
  const [replacing, setReplacing] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {if (client.settings) setTab(client.settings.provider);}, [client.settings]);
  const disabled = locked || client.busy || client.saving || client.loading;
  const settings = client.settings;
  async function choose(provider: AIProvider) {
    if (disabled) return;
    setMessage(''); setKey(''); setReplacing(false);
    if (provider === 'openai' && !settings?.hasKey) {setTab('openai'); return;}
    try {await client.update('PATCH', {provider}); setTab(provider);}
    catch {/* Keep the previous active provider and show the server error. */}
  }
  async function saveKey(event: React.FormEvent) {
    event.preventDefault();
    if (disabled || !key.trim()) return;
    try {await client.update('PUT', {key: key.trim()}); setKey(''); setReplacing(false); setMessage('Key saved. OpenAI is active.');}
    catch {/* Keep the draft in this form only, allowing a correction or retry. */}
  }
  if (client.loading && !settings) return <p className="ai-connection-loading" role="status"><Loader2 size={16} className="spin"/>Loading AI settings…</p>;
  if (!settings) return <div className="ai-error" role="alert">{client.error || 'AI settings could not be loaded.'}<button className="text-button" onClick={() => void client.load().catch(() => {})}>Retry</button></div>;
  return <div className="ai-connection-settings">
    <label className="handoff-label">AI provider
      <Select value={tab} onValueChange={value => void choose(value as AIProvider)} disabled={disabled}>
        <SelectTrigger aria-label="AI provider"><SelectValue/></SelectTrigger>
        <SelectContent><SelectItem value="puter">Puter</SelectItem><SelectItem value="openai">OpenAI · My API key</SelectItem></SelectContent>
      </Select>
    </label>
    <p className="control-note">Active: {settings.provider === 'openai' ? 'OpenAI' : 'Puter'}. Switching keeps your Puter sign-in.</p>
    {tab === 'puter' ? <fieldset disabled={disabled} className="ai-provider-fields"><PuterConnection client={client.puter}/></fieldset> : <div className="openai-settings">
      {settings.hasKey && <>
        <div className="openai-key-status"><Check size={16}/><span>Key saved · ••••{settings.lastFour}</span></div>
        <label className="handoff-label">OpenAI model
          <Select value={settings.model} disabled={disabled} onValueChange={model => {setMessage(''); void client.update('PATCH', {model}).catch(() => {});}}>
            <SelectTrigger aria-label="OpenAI model"><SelectValue/></SelectTrigger>
            <SelectContent>{settings.models.map(model => <SelectItem key={model} value={model}>{model}</SelectItem>)}</SelectContent>
          </Select>
        </label>
      </>}
      {(!settings.hasKey || replacing) && <form onSubmit={event => void saveKey(event)} className="openai-key-form">
        <label className="handoff-label" htmlFor="openai-api-key">{settings.hasKey ? 'Replacement API key' : 'Your OpenAI API key'}</label>
        <input id="openai-api-key" type="password" value={key} onChange={event => setKey(event.target.value)} placeholder="sk-…" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={512} disabled={disabled} aria-describedby="openai-key-help"/>
        <p id="openai-key-help" className="control-note">Saved encrypted for your account. Requests go directly from Luma to OpenAI and use your OpenAI API billing.</p>
        {!settings.secureStorageAvailable && <p className="ai-error">Secure key storage is not available here yet. Your key has not been saved.</p>}
        <button type="submit" className="primary" disabled={disabled || !key.trim() || !settings.secureStorageAvailable}>{client.saving && <Loader2 size={16} className="spin"/>}Save & use OpenAI</button>
        {settings.hasKey && <button type="button" className="text-button" disabled={disabled} onClick={() => {setReplacing(false); setKey('');}}>Cancel</button>}
      </form>}
      {settings.hasKey && !replacing && <div className="openai-key-actions">
        <button className="text-button" disabled={disabled} onClick={() => {setReplacing(true); setMessage('');}}>Replace key</button>
        <button className="text-button" disabled={disabled} onClick={() => {setMessage(''); void client.update('DELETE').then(() => {setKey(''); setMessage('OpenAI key removed. Puter is active.');}).catch(() => {});}}>Remove key</button>
      </div>}
    </div>}
    {client.saving && <p role="status" className="ai-connection-loading"><Loader2 size={16} className="spin"/>Saving…</p>}
    {locked && <p className="control-note">You can switch when the current AI action finishes.</p>}
    {message && <p role="status" className="control-note">{message}</p>}
    {client.error && <div role="alert" className="ai-error">{client.error}</div>}
  </div>;
}
