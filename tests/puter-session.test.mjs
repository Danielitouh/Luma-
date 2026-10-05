import assert from 'node:assert/strict';
import test from 'node:test';
import {chatWithPuter} from '../lib/puter.ts';

test('a delayed sign-in status does not block a valid Puter session', async () => {
  let calls = 0;
  const client = {
    auth: {isSignedIn: () => false},
    ai: {chat: async (prompt, options) => {
      calls++;
      assert.equal(prompt, 'Continue writing');
      assert.equal(options.model, 'claude-sonnet');
      return {message: {content: ' naturally'}};
    }},
  };
  assert.equal(await chatWithPuter(client, 'Continue writing', 'claude-sonnet'), ' naturally');
  assert.equal(calls, 1);
});

test('an invalid session remains a real authentication error', async () => {
  const client = {ai: {chat: async () => {throw new Error('Unauthorized');}}};
  await assert.rejects(chatWithPuter(client, 'Continue', 'claude-sonnet'), /Unauthorized/);
});
