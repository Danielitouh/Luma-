import assert from 'node:assert/strict';
import test from 'node:test';
import {LumaAgent, lumaAgent} from '../lib/luma-agent.ts';
import {parsePagePlan,applyPagePlan} from '../lib/codex-page.ts';

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

test('Codex plans no changes or edits only the selected page after waking', async () => {
  const page={id:'p1',title:'Thoughts',icon:'✳',favorite:false,project:'personal',updated:'2026-01-01',blocks:[{id:'a',type:'text',text:'First thought'},{id:'b',type:'todo',text:'Next step',checked:false}]};
  let calls=0;
  await assert.rejects(lumaAgent.planPage(page,async()=>{calls++;return '{}';}),/asleep/);
  assert.equal(calls,0);
  const agent=new LumaAgent();
  assert.equal(agent.name,'Codex');
  agent.wake();
  const plan=await agent.planPage(page,async()=>++calls===1?'{"emotion":"curious"}':'{"note":"Add a clear heading","changes":[{"kind":"insert_block","afterId":null,"type":"heading","text":"Today"},{"kind":"toggle_todo","blockId":"b","checked":true}]}');
  const result=applyPagePlan(page,plan,()=> 'new');
  assert.deepEqual(result.blocks.map(block=>block.id),['new','a','b']);
  assert.equal(result.blocks[2].checked,true);
  assert.equal(page.blocks[1].checked,false);
  agent.sleep();
  assert.deepEqual(lumaAgent.getSnapshot(),{status:'asleep',emotion:'sleepy'});
});

test('invalid or stale page plans cannot partly edit a page', () => {
  const page={id:'p1',title:'Original',icon:'✳',favorite:false,project:'personal',updated:'2026-01-01',blocks:[{id:'a',type:'text',text:'Keep this'}]};
  assert.throws(()=>parsePagePlan('{"note":"x","changes":[{"kind":"execute_code","code":"anything"}]}'),/unsupported/);
  const plan=parsePagePlan('{"note":"x","changes":[{"kind":"set_title","title":"Draft"},{"kind":"replace_text","blockId":"missing","text":"Wrong"}]}');
  assert.throws(()=>applyPagePlan(page,plan,()=> 'new'),/page changed/i);
  assert.equal(page.title,'Original');
  assert.equal(page.blocks[0].text,'Keep this');
});

test('Codex accepts a fenced plan, repairs prose once, and keeps page contexts separate', async () => {
  const page={id:'p1',title:'First page',icon:'✳',favorite:false,project:'personal',updated:'2026-01-01',blocks:[{id:'a',type:'text',text:'A thought'}]};
  const agent=new LumaAgent();agent.wake();
  let calls=0;
  const plan=await agent.planPage(page,async messages=>{
    calls++;
    if(calls===1)return '{"emotion":"curious"}';
    if(calls===2)return 'This page could use a heading.';
    assert.match(messages.at(-1).content,/First page/);
    return '```json\n{"note":"Added a heading","changes":[{"kind":"insert_block","afterId":null,"type":"heading","text":"A heading"}]}\n```';
  });
  assert.equal(calls,3);
  assert.equal(plan.changes[0].kind,'insert_block');
  const second={...page,id:'p2',title:'Another page',blocks:[{id:'b',type:'text',text:'Private to this page'}]};
  await agent.planPage(second,async messages=>{
    assert.doesNotMatch(JSON.stringify(messages),/A thought|First page|Added a heading/);
    return messages.at(-1).content.startsWith('Consider')?'{"emotion":"calm"}':'{"note":"No change","changes":[]}';
  });
});

test('malformed plans leave the page untouched after one repair attempt', async () => {
  const page={id:'p1',title:'Original',icon:'✳',favorite:false,project:'personal',updated:'2026-01-01',blocks:[{id:'a',type:'text',text:'Keep this'}]};
  const agent=new LumaAgent();agent.wake();
  let calls=0;
  await assert.rejects(agent.planPage(page,async()=>{calls++;return calls===1?'{}':'This is not a plan.';}),/Nothing on your page changed/);
  assert.equal(calls,3);
  assert.equal(page.blocks[0].text,'Keep this');
  assert.throws(()=>parsePagePlan('Here is the plan: {"note":"x","changes":[{"kind":"execute_code","code":"bad"}]}'),/unsupported/);
});
