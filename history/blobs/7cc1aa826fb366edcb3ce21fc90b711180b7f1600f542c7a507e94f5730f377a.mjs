import assert from 'node:assert/strict';
import test from 'node:test';
import {LumaAgent} from '../lib/luma-agent.ts';

test('the agent stays asleep and makes no AI call until explicitly activated', async () => {
  const agent = new LumaAgent();
  let calls = 0;
  assert.equal(agent.status, 'asleep');
  await assert.rejects(agent.respond('hello', async () => { calls++; return 'hello'; }), /asleep/);
  assert.equal(calls, 0);
  agent.wake();
  assert.equal(await agent.respond('hello', async messages => { calls++; assert.deepEqual(messages, [{role: 'user', content: 'hello'}]); return 'hello'; }), 'hello');
  assert.equal(calls, 1);
  agent.sleep();
  await assert.rejects(agent.respond('again', async () => { calls++; return 'again'; }), /asleep/);
  assert.equal(calls, 1);
});
