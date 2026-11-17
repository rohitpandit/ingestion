import { env } from '../config/env.js';
import { MockRuleBasedProvider } from './mock/index.js';
import type { LlmProvider } from './provider.js';

const providers: Record<typeof env.LLM_PROVIDER, () => LlmProvider> = {
  mock: () => new MockRuleBasedProvider(),
};

/**
 * Chosen by LLM_PROVIDER. A hosted model would register here and satisfy the
 * same interface; nothing downstream knows which implementation ran.
 */
export function createProvider(): LlmProvider {
  return providers[env.LLM_PROVIDER]();
}
