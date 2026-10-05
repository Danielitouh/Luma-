/** Luma's agent exists independently of the editor AI and starts asleep. */
export class LumaAgent {
  readonly id = 'luma-agent';
  readonly name = 'AI Agent';
  private awake = false;
  private conversation: {role: 'user' | 'assistant'; content: string}[] = [];

  get status(): 'asleep' | 'awake' { return this.awake ? 'awake' : 'asleep'; }

  // Activation is intentionally not connected to the UI yet.
  wake() { this.awake = true; }
  sleep() { this.awake = false; }

  async respond(message: string, generate: (messages: readonly {role: 'user' | 'assistant'; content: string}[]) => Promise<string>): Promise<string> {
    if (!this.awake) throw new Error('The AI Agent is asleep.');
    const content = message.trim();
    if (!content) throw new Error('Write a message first.');
    const reply = await generate([...this.conversation, {role: 'user', content}]);
    if (!reply.trim()) throw new Error('The AI Agent returned no answer.');
    this.conversation.push({role: 'user', content}, {role: 'assistant', content: reply});
    return reply;
  }
}

export const lumaAgent = new LumaAgent();
