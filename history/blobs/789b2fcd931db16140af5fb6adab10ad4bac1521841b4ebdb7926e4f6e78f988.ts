type Message = {role: 'user' | 'assistant'; content: string};
type Generate = (messages: readonly Message[]) => Promise<string>;
import type {Page} from './workspace';
import {parsePagePlan,type PagePlan} from './codex-page.ts';
export type SimulatedEmotion = 'sleepy' | 'calm' | 'focused' | 'curious' | 'happy' | 'sad' | 'surprised';
export type AgentState = Readonly<{status: 'asleep' | 'awake'; emotion: SimulatedEmotion}>;

const allowedEmotions: SimulatedEmotion[] = ['calm', 'focused', 'curious', 'happy', 'sad', 'surprised'];
type Assessment = {emotion: SimulatedEmotion; uncertainty: string[]; alternatives: string[]; checks: string[]};

function assess(raw: string): Assessment {
  let value: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) value = parsed as Record<string, unknown>;
  } catch { /* A malformed assessment must not become an instruction. */ }
  const brief = (field: string) => Array.isArray(value[field])
    ? (value[field] as unknown[]).filter((item): item is string => typeof item === 'string').slice(0, 3).map(item => item.slice(0, 180))
    : [];
  return {
    emotion: allowedEmotions.includes(value.emotion as SimulatedEmotion) ? value.emotion as SimulatedEmotion : 'calm',
    uncertainty: brief('uncertainty'), alternatives: brief('alternatives'), checks: brief('checks'),
  };
}

/** The pet's dormant agent. Expressions are simulated display states, not lived feelings. */
export class LumaAgent {
  readonly id = 'codex-agent';
  readonly name = 'Codex';
  private snapshot: AgentState = Object.freeze({status: 'asleep', emotion: 'sleepy'});
  private listeners = new Set<() => void>();
  private conversation: Message[] = [];
  private generation = 0;
  private busy = false;

  get status() { return this.snapshot.status; }
  get emotion() { return this.snapshot.emotion; }
  getSnapshot = (): AgentState => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private setState(status: AgentState['status'], emotion: SimulatedEmotion) {
    if (this.snapshot.status === status && this.snapshot.emotion === emotion) return;
    this.snapshot = Object.freeze({status, emotion});
    this.listeners.forEach(listener => listener());
  }

  // Nothing in the current UI calls wake or respond. The pet stays asleep.
  wake() { this.setState('awake', 'calm'); }
  sleep() { this.generation++; this.busy = false; this.setState('asleep', 'sleepy'); }

  async respond(message: string, generate: Generate): Promise<string> {
    if (this.status === 'asleep') throw new Error('The AI Agent is asleep.');
    if (this.busy) throw new Error('The AI Agent is still thinking.');
    const content = message.trim();
    if (!content) throw new Error('Write a message first.');
    const run = ++this.generation;
    this.busy = true;
    this.setState('awake', 'focused');
    const history = this.conversation.slice(-12);
    try {
      const reflection = await generate([...history, {role: 'user', content:
        'Consider the following message carefully before answering it. Return ONLY compact JSON with: emotion (calm, focused, curious, happy, sad, or surprised) for the pet’s simulated expression; uncertainty (up to 3 short points); alternatives (up to 3 plausible readings or options); checks (up to 3 facts or assumptions to verify). Do not claim certainty without evidence. Message: ' + JSON.stringify(content)}]);
      if (run !== this.generation || this.getSnapshot().status === 'asleep') throw new Error('The AI Agent is asleep.');
      const assessment = assess(reflection);
      this.setState('awake', assessment.emotion);
      const reply = await generate([...history, {role: 'user', content:
        'Respond to this message: ' + JSON.stringify(content) + '\nBefore answering, account for these possible uncertainties, alternatives, and checks where relevant: ' + JSON.stringify({uncertainty: assessment.uncertainty, alternatives: assessment.alternatives, checks: assessment.checks}) + '\nBe clear about uncertainty. Give the user the answer, not the private assessment.'}]);
      if (run !== this.generation || this.getSnapshot().status === 'asleep') throw new Error('The AI Agent is asleep.');
      if (!reply.trim()) throw new Error('The AI Agent returned no answer.');
      this.conversation.push({role: 'user', content}, {role: 'assistant', content: reply});
      this.setState('awake', assessment.emotion);
      return reply;
    } catch (error) {
      if (run === this.generation && this.status === 'awake') this.setState('awake', 'sad');
      throw error;
    } finally {
      if (run === this.generation) this.busy = false;
    }
  }

  /** Self-directed page planning. The live pet stays asleep until explicitly awakened elsewhere. */
  async planPage(page:Page,generate:Generate):Promise<PagePlan> {
    if(this.status==='asleep')throw new Error('Codex is asleep.');
    const context={title:page.title,icon:page.icon,blocks:page.blocks.map(block=>({id:block.id,type:block.type,text:block.text,checked:block.checked}))};
    const prompt='You are Codex, a helpful companion inside this one Luma page. Decide for yourself whether any edits would make this page clearer or more useful. You may leave it unchanged. Preserve the author’s voice and formatting; do not invent facts. You can edit only this page. Return ONLY JSON {"note":"short explanation","changes":[...]}, with at most 8 changes. Allowed changes: {"kind":"set_title","title":"..."}, {"kind":"set_icon","icon":"..."}, {"kind":"replace_text","blockId":"existing id","text":"..."}, {"kind":"insert_block","afterId":"existing id or null","type":"text|heading|todo|quote|bullet","text":"..."}, {"kind":"remove_block","blockId":"existing id"}, {"kind":"move_block","blockId":"existing id","afterId":"existing id or null"}, {"kind":"toggle_todo","blockId":"existing todo id","checked":true}. Use [] if no change seems helpful. Page: '+JSON.stringify(context);
    return parsePagePlan(await this.respond(prompt,generate));
  }
}

export const lumaAgent = new LumaAgent();
