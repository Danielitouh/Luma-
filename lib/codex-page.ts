import type {Block, Page} from './workspace';

export type PageChange =
  | {kind:'set_title'; title:string}
  | {kind:'set_icon'; icon:string}
  | {kind:'replace_text'; blockId:string; text:string}
  | {kind:'insert_block'; afterId:string|null; type:Block['type']; text:string}
  | {kind:'remove_block'; blockId:string}
  | {kind:'move_block'; blockId:string; afterId:string|null}
  | {kind:'toggle_todo'; blockId:string; checked:boolean};
export type PagePlan = {note:string; changes:PageChange[]; continueWorking?:boolean};

const blockTypes = new Set<Block['type']>(['text','heading','todo','quote','bullet']);
const record = (value:unknown):value is Record<string,unknown> => !!value && typeof value==='object' && !Array.isArray(value);
const string = (value:unknown,max:number):value is string => typeof value==='string' && value.length<=max;
const id = (value:unknown):value is string => string(value,128) && value.length>0;
const anchor = (value:unknown):value is string|null => value===null || id(value);

/** Find a single JSON object even when a model wraps it in prose or a code fence. */
function jsonObject(raw:string):unknown {
  const text=raw.trim();
  if(text.length>100000)throw new Error('Codex returned a page plan that is too long.');
  for(let start=text.indexOf('{');start>=0;start=text.indexOf('{',start+1)){
    let depth=0,quoted=false,escaped=false;
    for(let i=start;i<text.length;i++){
      const char=text[i];
      if(quoted){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')quoted=false;continue;}
      if(char==='"'){quoted=true;continue;}
      if(char==='{')depth++;
      if(char==='}'&&--depth===0){
        try{const parsed:unknown=JSON.parse(text.slice(start,i+1));if(record(parsed)&&'changes' in parsed)return parsed;}catch{/* Look for another complete object. */}
        break;
      }
    }
  }
  throw new Error('Codex did not return a readable page plan.');
}

/** Untrusted model output is data, never executable page code. Reject the entire plan on an invalid operation. */
export function parsePagePlan(raw:string):PagePlan {
  const parsed:unknown = jsonObject(raw);
  if(!record(parsed)||!Array.isArray(parsed.changes)||parsed.changes.length>8||!string(parsed.note,500))throw new Error('Codex returned an invalid page plan.');
  const changes:PageChange[]=[];
  for(const change of parsed.changes){
    if(!record(change))throw new Error('Codex returned an invalid page change.');
    switch(change.kind){
      case 'set_title': if(string(change.title,200)&&change.title.trim())changes.push({kind:'set_title',title:change.title});else throw new Error('Codex returned an invalid title.');break;
      case 'set_icon': if(string(change.icon,8)&&change.icon.trim())changes.push({kind:'set_icon',icon:change.icon});else throw new Error('Codex returned an invalid icon.');break;
      case 'replace_text': if(id(change.blockId)&&string(change.text,100000))changes.push({kind:'replace_text',blockId:change.blockId,text:change.text});else throw new Error('Codex returned invalid block text.');break;
      case 'insert_block': if(anchor(change.afterId)&&blockTypes.has(change.type as Block['type'])&&string(change.text,100000))changes.push({kind:'insert_block',afterId:change.afterId,type:change.type as Block['type'],text:change.text});else throw new Error('Codex returned an invalid new block.');break;
      case 'remove_block': if(id(change.blockId))changes.push({kind:'remove_block',blockId:change.blockId});else throw new Error('Codex returned an invalid block reference.');break;
      case 'move_block': if(id(change.blockId)&&anchor(change.afterId)&&change.blockId!==change.afterId)changes.push({kind:'move_block',blockId:change.blockId,afterId:change.afterId});else throw new Error('Codex returned an invalid block move.');break;
      case 'toggle_todo': if(id(change.blockId)&&typeof change.checked==='boolean')changes.push({kind:'toggle_todo',blockId:change.blockId,checked:change.checked});else throw new Error('Codex returned an invalid checklist change.');break;
      default: throw new Error('Codex returned an unsupported page change.');
    }
  }
  if(parsed.continueWorking!==undefined&&typeof parsed.continueWorking!=='boolean')throw new Error('Codex returned an invalid continuation decision.');
  return {note:parsed.note,changes,...(typeof parsed.continueWorking==='boolean'?{continueWorking:parsed.continueWorking}:{})};
}

/** Apply one validated plan atomically to the selected page only. No workspace-wide operations. */
export function applyPagePlan(page:Page,plan:PagePlan,newId:()=>string):Page {
  let title=page.title,icon=page.icon;
  const blocks=page.blocks.map(block=>({...block}));
  const position=(blockId:string)=>{
    const index=blocks.findIndex(block=>block.id===blockId);
    if(index<0)throw new Error('The page changed. Reopen Codex from the current page.');
    return index;
  };
  const after=(afterId:string|null)=>afterId===null?0:position(afterId)+1;
  for(const change of plan.changes){
    switch(change.kind){
      case 'set_title': title=change.title;break;
      case 'set_icon': icon=change.icon;break;
      case 'replace_text': blocks[position(change.blockId)].text=change.text;break;
      case 'insert_block': {
        if(blocks.length>=500)throw new Error('This page has reached its block limit.');
        const insertAt=after(change.afterId),blockId=newId();
        if(!id(blockId)||blocks.some(block=>block.id===blockId))throw new Error('Could not create a unique block.');
        blocks.splice(insertAt,0,{id:blockId,type:change.type,text:change.text});break;
      }
      case 'remove_block': blocks.splice(position(change.blockId),1);break;
      case 'move_block': {
        const [block]=blocks.splice(position(change.blockId),1);
        blocks.splice(after(change.afterId),0,block);break;
      }
      case 'toggle_todo': {
        const block=blocks[position(change.blockId)];
        if(block.type!=='todo')throw new Error('That block is not a checklist item.');
        block.checked=change.checked;break;
      }
    }
  }
  if(!blocks.length)throw new Error('Codex cannot leave a page without any blocks.');
  return {...page,title,icon,blocks,updated:new Date().toISOString()};
}
