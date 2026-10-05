import assert from 'node:assert/strict';
import test from 'node:test';
import {pageInitiativePrompt,runPageInitiative} from '../lib/page-initiative.ts';
import {LumaAgent} from '../lib/luma-agent.ts';

const page=()=>({id:'pits',title:'Pits',icon:'✳',favorite:false,project:'personal',updated:'2026-01-01',blocks:[{id:'prompt',type:'text',text:'Describe a pitbull to me'}]});
const insert=(text,continueWorking=false)=>({note:'I added a description.',continueWorking,changes:[{kind:'insert_block',afterId:'prompt',type:'text',text}]});

test('unanswered requests invite substantive writing rather than proofreading-only refusals',async()=>{
 const agent=new LumaAgent();agent.wake();let calls=0;
 const plan=await agent.planPage(page(),async messages=>{
  const prompt=messages.at(-1).content;
  assert.match(prompt,/answer it directly ON THE PAGE/);
  assert.match(prompt,/reliable general knowledge/);
  assert.match(prompt,/not merely a proofreader/);
  assert.match(prompt,/Only the supplied page/);
  return ++calls===1?'{"emotion":"curious"}':JSON.stringify(insert('A pitbull is a muscular, short-coated dog.'));
 });
 assert.equal(plan.changes[0].kind,'insert_block');assert.equal(calls,2);
 assert.match(pageInitiativePrompt({...page(),title:'Untitled',blocks:[]}),/start a short, useful scratchpad/);
});

test('agent observes its own edits and chooses a useful follow-up without another click',async()=>{
 const initial=page();let live=initial,calls=0;const commits=[];
 const result=await runPageInitiative({page:initial,newId:()=>`new-${calls}`,isActive:()=>true,
  plan:async(current,progress)=>{
   calls++;assert.equal(progress.pass,calls);
   if(calls===1)return insert('A description.',true);
   assert.equal(current.blocks[1].text,'A description.');assert.equal(progress.completed.length,1);
   return {note:'I added useful context too.',continueWorking:false,changes:[{kind:'insert_block',afterId:current.blocks[1].id,type:'text',text:'Temperament varies by individual.'}]};
  },commit:(before,after)=>{assert.equal(before,live);live=after;commits.push(after);}});
 assert.equal(calls,2);assert.equal(commits.length,2);assert.equal(result.page.id,initial.id);
 assert.equal(initial.blocks.length,1);assert.equal(live.blocks[0].text,'Describe a pitbull to me');
 assert.equal(result.passes,2);
});

test('stops at the pass limit, on no-op plans, or when the person stops the agent',async()=>{
 let calls=0;
 const result=await runPageInitiative({page:page(),newId:()=>`new-${calls}`,isActive:()=>true,commit:()=>{},plan:async()=>{calls++;return insert(`Step ${calls}`,true);}});
 assert.equal(calls,3);assert.equal(result.passes,3);
 calls=0;
 await runPageInitiative({page:page(),newId:()=>'',isActive:()=>true,commit:()=>assert.fail('no-op committed'),plan:async()=>{calls++;return {note:'Done',continueWorking:true,changes:[{kind:'set_title',title:'Pits'}]};}});
 assert.equal(calls,1);
 let active=true,resolve;
 const pending=runPageInitiative({page:page(),newId:()=>'',isActive:()=>active,commit:()=>assert.fail('stopped work committed'),plan:()=>new Promise(done=>{resolve=done;})});
 active=false;resolve(insert('Do not insert this',true));await assert.rejects(pending,/stopped/);
});

test('a conflict or failed follow-up stops, keeping earlier changes available to the caller for undo',async()=>{
 const initial=page();let calls=0;const applied=[];
 await assert.rejects(runPageInitiative({page:initial,newId:()=>`n${calls}`,isActive:()=>true,plan:async()=>{if(++calls===2)throw Error('provider unavailable');return insert('Keep this successful contribution',true);},commit:(before,after)=>applied.push({before,after})}),/provider unavailable/);
 assert.equal(applied.length,1);assert.equal(applied[0].before,initial);assert.equal(initial.blocks.length,1);
 calls=0;
 await assert.rejects(runPageInitiative({page:initial,newId:()=>`n${calls}`,isActive:()=>true,plan:async()=>{calls++;return insert('A draft',true);},commit:()=>{throw Error('page changed');}}),/page changed/);
 assert.equal(calls,1);
});
