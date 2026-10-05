import assert from 'node:assert/strict';
import test from 'node:test';
import {encryptAIKey, decryptAIKey} from '../lib/ai-key-crypto.ts';
import {providerGenerator} from '../lib/ai-provider.ts';
import {generateWithOpenAI, listOpenAIModels, openAIText} from '../lib/openai-api.ts';

test('saved keys are encrypted, randomized and bound to one user', async () => {
  const secret = 'a1'.repeat(32);
  const input = 'test-placeholder-not-a-real-key';
  const first = await encryptAIKey(input, 'alice', secret);
  const second = await encryptAIKey(input, 'alice', secret);
  assert.notEqual(first, second);
  assert.ok(!first.includes(input));
  assert.equal(await decryptAIKey(first, 'alice', secret), input);
  await assert.rejects(decryptAIKey(first, 'bob', secret));
  await assert.rejects(decryptAIKey(first, 'alice', 'b2'.repeat(32)));
  await assert.rejects(encryptAIKey(input, 'alice', ''));
});

test('switching generators does not sign out, fall back, or alter an in-flight generator', async () => {
  const calls = [];
  const puter = async text => {calls.push('puter'); return text;};
  const openai = async text => {calls.push('openai'); return text;};
  const original = providerGenerator('puter', puter, openai);
  await original('one');
  await providerGenerator('openai', puter, openai)('two');
  await original('three');
  await providerGenerator('puter', puter, openai)('four');
  assert.deepEqual(calls, ['puter', 'openai', 'puter', 'puter']);
  await assert.rejects(providerGenerator('openai', puter, async () => {throw Error('OpenAI unavailable');})('five'));
  assert.equal(calls.length, 4);
});

test('OpenAI uses the fixed server endpoint and preserves whitespace from all output messages', async () => {
  let count = 0;
  const mock = async (url, init) => {
    count++;
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(init.method, 'POST');
    assert.equal(init.redirect, 'error');
    const body = JSON.parse(init.body);
    assert.equal(body.model, 'gpt-6-sol');
    assert.equal(body.store, false);
    assert.equal(body.input, 'Continue');
    assert.equal(body.max_output_tokens, 8192);
    return Response.json({status: 'completed', output: [{type: 'reasoning'}, {type: 'message', content: [{type: 'output_text', text: ' natural'}]}, {type: 'message', content: [{type: 'output_text', text: ' continuation '}]}]});
  };
  assert.equal(await generateWithOpenAI('placeholder', 'gpt-6-sol', 'Continue', mock), ' natural continuation ');
  assert.equal(count, 1);
});

test('invalid key, quota, timeout and incomplete output fail safely without retry or key disclosure', async () => {
  let calls = 0;
  await assert.rejects(generateWithOpenAI('placeholder', 'gpt-6-sol', 'Continue', async () => {
    calls++;
    return Response.json({error: {message: 'secret-key-fragment', code: 'invalid_api_key'}}, {status: 401});
  }), error => /API key/.test(error.message) && !error.message.includes('secret-key-fragment'));
  assert.equal(calls, 1);
  await assert.rejects(generateWithOpenAI('placeholder', 'gpt-6-sol', 'Continue', async () => Response.json({error: {code: 'insufficient_quota'}}, {status: 429})), /credits/);
  await assert.rejects(generateWithOpenAI('placeholder', 'gpt-6-sol', 'Continue', async () => {throw new DOMException('secret', 'TimeoutError');}), /too long/);
  assert.throws(() => openAIText({status: 'incomplete', output: [{type: 'message', content: [{type: 'output_text', text: 'partial'}]}]}), /did not finish/);
  assert.throws(() => openAIText({status: 'completed', output: []}), /no text/);
});

test('key validation lists supported text models without a paid generation', async () => {
  const models = await listOpenAIModels('placeholder', async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/models');
    assert.equal(init.method, 'GET');
    return Response.json({data: [{id: 'gpt-6-sol'}, {id: 'gpt-6-astra'}, {id: 'gpt-audio'}, {id: 'gpt-4o-realtime-preview'}, {id: 'gpt-4.1'}, {id: 'gpt-3.5-turbo'}]});
  });
  assert.deepEqual(models, ['gpt-6-sol', 'gpt-6-astra', 'gpt-4.1']);
});
