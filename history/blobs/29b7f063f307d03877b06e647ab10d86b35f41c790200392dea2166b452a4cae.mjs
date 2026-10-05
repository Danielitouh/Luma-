import assert from 'node:assert/strict';
import test from 'node:test';
import {LumaAgent, lumaAgent} from '../lib/luma-agent.ts';

test('the pet’s actual agent remains asleep and cannot call a model', async () => {
  assert.deepEqual(lumaAgent.getSnapshot(), {status: 'asleep', emotion: 'sleepy'});
  let calls = 0;
  await assert.rejects(lumaAgent.respond('hello', async () => {calls++; return 'hello';}), /asleep/);
  assert.equal(calls, 0);
});

test('a separate agent reflects before replying and exposes its simulated expression', async () => {
  const agent = new LumaAgent();
  const states = [];
  const unsubscribe = agent.subscribe(() => states.push(agent.getSnapshot()));
  agent.wake();
  let calls = 0;
  const answer = await agent.respond('What do you think?', async messages => {
    calls++;
    assert.match(messages.at(-1).content, /What do you think\?/);
    return calls === 1
      ? JSON.stringify({emotion: 'curious', uncertainty: ['Need more context'], alternatives: ['Option A'], checks: ['Verify source']})
      : 'I need more context to answer confidently.';
  });
  assert.equal(answer, 'I need more context to answer confidently.');
  assert.equal(calls, 2);
  assert.deepEqual(states.map(s => s.emotion), ['calm', 'focused', 'curious']);
  agent.sleep();
  assert.deepEqual(agent.getSnapshot(), {status: 'asleep', emotion: 'sleepy'});
  unsubscribe();
});

test('putting the agent back to sleep discards an answer still in progress', async () => {
  const agent = new LumaAgent();
  agent.wake();
  let resolve;
  const pending = agent.respond('Hello', () => new Promise(done => {resolve = done;}));
  agent.sleep();
  resolve('{"emotion":"happy"}');
  await assert.rejects(pending, /asleep/);
  assert.equal(agent.status, 'asleep');
});
