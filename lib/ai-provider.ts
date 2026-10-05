export type AIProvider = 'puter' | 'openai';
export type AIConnection = {
  provider: AIProvider;
  hasKey: boolean;
  lastFour: string;
  model: string;
  models: string[];
  secureStorageAvailable: boolean;
};
export function aiErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'The AI request failed. Please try again.';
}

// Keep the provider fixed for an entire editor/agent action. No implicit fallback.
export function providerGenerator(provider: AIProvider, puter: (prompt: string) => Promise<string>, openai: (prompt: string) => Promise<string>) {
  return provider === 'openai' ? openai : puter;
}
