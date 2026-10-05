import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';

// Exercise the actual server routes with an isolated database and mocked HTTP.
// No credentials or requests leave this process.
const envURL = 'data:text/javascript,export const env = {};';
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'cloudflare:workers') return {url: envURL, shortCircuit: true};
    if (specifier.startsWith('@/')) return next(new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href, context);
    if (context.parentURL?.endsWith('/db/ai-connections.ts') && specifier === './storage') return next(new URL('../db/storage.ts', import.meta.url).href, context);
    return next(specifier, context);
  },
  load(url, context, next) {
    const result = next(url, context);
    if (url.endsWith('/db/storage.ts')) return {...result, source: String(result.source).replace('import.meta.env.DEV', 'false')};
    return result;
  },
});
const {env} = await import(envURL);
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('../drizzle/0001_volatile_komodo.sql', import.meta.url), 'utf8'));
env.LUMA_AI_ENCRYPTION_KEY = 'a1'.repeat(32);
env.DB = {prepare(sql) {
  return {bind(...params) {
    return {
      async first() {return sqlite.prepare(sql).get(...params) || null;},
      async run() {return {meta: {changes: Number(sqlite.prepare(sql).run(...params).changes)}};},
    };
  }};
}};
const settings = await import('../app/api/ai/settings/route.ts');
const generate = await import('../app/api/ai/generate/route.ts');
function request(method, body, owner = 'alice', origin = 'https://luma.test') {
  return new Request('https://luma.test/api/ai', {method, headers: {'oai-authenticated-user-id': owner, Origin: origin, 'X-Luma-AI': '1', 'Content-Type': 'application/json'}, ...(body ? {body: JSON.stringify(body)} : {})});
}
const fakeKey = 'sk-test-placeholder-not-a-real-api-key';

test('AI settings isolate owners, never return keys, preserve saved keys when switching and reject invalid replacements', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async url => {
      assert.equal(url, 'https://api.openai.com/v1/models');
      return Response.json({data: [{id: 'gpt-6-sol'}]});
    };
    assert.equal((await settings.GET(request('GET', null, ''))).status, 401);
    assert.equal((await settings.PUT(request('PUT', {key: fakeKey}, 'alice', 'https://other.test'))).status, 403);
    const saved = await settings.PUT(request('PUT', {key: fakeKey}));
    assert.equal(saved.status, 200);
    const publicData = await saved.json();
    assert.equal(publicData.provider, 'openai');
    assert.equal(publicData.lastFour, fakeKey.slice(-4));
    assert.equal(JSON.stringify(publicData).includes(fakeKey), false);
    assert.equal('encrypted_key' in publicData, false);
    const encrypted = sqlite.prepare('SELECT encrypted_key FROM ai_connections WHERE user_id=?').get('alice').encrypted_key;
    assert.ok(encrypted.startsWith('v1.'));
    assert.notEqual(encrypted, fakeKey);
    const bob = await (await settings.GET(request('GET', null, 'bob'))).json();
    assert.equal(bob.hasKey, false);
    assert.equal((await settings.PATCH(request('PATCH', {provider: 'openai'}, 'bob'))).status, 400);
    assert.equal((await settings.PATCH(request('PATCH', {provider: 'puter'}))).status, 200);
    assert.equal(sqlite.prepare('SELECT encrypted_key FROM ai_connections WHERE user_id=?').get('alice').encrypted_key, encrypted);
    assert.equal((await settings.PATCH(request('PATCH', {provider: 'openai'}))).status, 200);
    globalThis.fetch = async () => Response.json({error: {code: 'invalid_api_key', message: fakeKey}}, {status: 401});
    const rejected = await settings.PUT(request('PUT', {key: fakeKey}));
    assert.equal(rejected.status, 401);
    assert.equal((await rejected.text()).includes(fakeKey), false);
    assert.equal(sqlite.prepare('SELECT encrypted_key FROM ai_connections WHERE user_id=?').get('alice').encrypted_key, encrypted);
  } finally {globalThis.fetch = originalFetch;}
});

test('generation locks duplicate requests and config changes, then releases on success and failure', async () => {
  const originalFetch = globalThis.fetch;
  let release;
  let started;
  let calls = 0;
  const ready = new Promise(resolve => {started = resolve;});
  try {
    globalThis.fetch = async (url, init) => {
      calls++;
      assert.equal(url, 'https://api.openai.com/v1/responses');
      assert.equal(init.headers.Authorization, `Bearer ${fakeKey}`);
      started();
      await new Promise(resolve => {release = resolve;});
      return Response.json({status: 'completed', output: [{type: 'message', content: [{type: 'output_text', text: ' continuation'}]}]});
    };
    const body = {prompt: 'Continue', model: 'gpt-6-sol'};
    const pending = generate.POST(request('POST', body));
    await ready;
    assert.equal((await generate.POST(request('POST', body))).status, 409);
    assert.equal((await settings.PATCH(request('PATCH', {provider: 'puter'}))).status, 409);
    assert.equal((await settings.DELETE(request('DELETE'))).status, 409);
    assert.equal(calls, 1);
    release();
    assert.equal((await (await pending).json()).text, ' continuation');
    assert.equal(sqlite.prepare('SELECT request_until FROM ai_connections WHERE user_id=?').get('alice').request_until, 0);
    globalThis.fetch = async () => {throw new Error('provider secret error');};
    const failed = await generate.POST(request('POST', body));
    assert.equal(failed.status, 502);
    assert.equal((await failed.text()).includes('provider secret error'), false);
    assert.equal(sqlite.prepare('SELECT request_until FROM ai_connections WHERE user_id=?').get('alice').request_until, 0);
    assert.equal((await generate.POST(request('POST', body, 'bob'))).status, 400);
    assert.equal((await settings.DELETE(request('DELETE'))).status, 200);
    const removed = await (await settings.GET(request('GET'))).json();
    assert.equal(removed.hasKey, false);
    assert.equal(removed.provider, 'puter');
  } finally {globalThis.fetch = originalFetch; release?.();}
});
