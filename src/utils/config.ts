/**
 * Configuration loader using cosmiconfig and zod
 */

import { cosmiconfig } from 'cosmiconfig';
import { z } from 'zod';
import { DOUBAO_SEED_CODE_LIMITS } from '../llm/types.js';
import { ConfigError } from '../errors/types.js';

/**
 * Volcengine specific config schema
 */
const VolcengineConfigSchema = z.object({
  enablePrefixCache: z.boolean().default(true),
  cacheMinTokens: z.number().default(1024),
  enableThinking: z.boolean().default(false),
  maxThinkingTokens: z.number().default(32768),
});

/**
 * LLM config schema
 */
const LLMConfigSchema = z.object({
  provider: z.enum(['anthropic', 'openai', 'volcengine']).default('volcengine'),
  model: z.string().default('doubao-seed-code-preview-251028'),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().default(8192),
  maxInputTokens: z.number().optional(),
  contextWindow: z.number().optional(),
  timeout: z.number().default(120000),
  volcengine: VolcengineConfigSchema.optional(),
});

/**
 * Budget config schema
 */
const BudgetConfigSchema = z.object({
  contextWindow: z.number().default(DOUBAO_SEED_CODE_LIMITS.contextWindow),
  reservedForSynthesis: z.number().default(30000),
  reservedForRecalls: z.number().default(20000),
  reservedForNextSteps: z.number().default(15000),
});

/**
 * Agent config schema
 */
const AgentConfigSchema = z.object({
  maxIterations: z.number().default(20),
  stuckThreshold: z.number().default(3),
  enableThinking: z.boolean().default(false),
  thinkingBudget: z.number().default(32768),
});

/**
 * Full config schema
 */
const ConfigSchema = z.object({
  llm: LLMConfigSchema.default({}),
  budget: BudgetConfigSchema.default({}),
  agent: AgentConfigSchema.default({}),
  tools: z.object({
    enabledTools: z.array(z.string()).optional(),
    disabledTools: z.array(z.string()).optional(),
    toolConfigs: z.record(z.record(z.unknown())).optional(),
  }).default({}),
  output: z.object({
    format: z.enum(['cli', 'json', 'acp']).default('cli'),
    verbose: z.boolean().default(false),
    color: z.boolean().default(true),
  }).default({}),
  log: z.object({
    level: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
    pretty: z.boolean().default(true),
    file: z.string().optional(),
  }).default({}),
});

export type ChibiConfig = z.infer<typeof ConfigSchema>;

/**
 * Load configuration from file and environment
 */
export async function loadConfig(configPath?: string): Promise<ChibiConfig> {
  const explorer = cosmiconfig('chibi', {
    searchPlaces: [
      'chibi.config.js',
      'chibi.config.mjs',
      'chibi.config.json',
      'chibi.config.yaml',
      'chibi.config.yml',
      '.chibirc',
      '.chibirc.json',
      '.chibirc.yaml',
      '.chibirc.yml',
    ],
  });

  try {
    let result;
    if (configPath) {
      result = await explorer.load(configPath);
    } else {
      result = await explorer.search();
    }

    const fileConfig = result?.config ?? {};

    // Merge with environment variables
    const envConfig = getEnvConfig();
    const merged = mergeConfigs(fileConfig, envConfig);

    // Validate and return
    return ConfigSchema.parse(merged);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
      throw new ConfigError(`Invalid configuration:\n${messages.join('\n')}`);
    }
    throw error;
  }
}

/**
 * Get configuration from environment variables
 */
function getEnvConfig(): Record<string, unknown> {
  const config: Record<string, unknown> = {};

  // LLM config from env
  if (process.env.ARK_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY) {
    const llm: Record<string, unknown> = {};

    if (process.env.ARK_API_KEY) {
      llm.provider = 'volcengine';
      llm.apiKey = process.env.ARK_API_KEY;
      llm.model = process.env.ARK_MODEL ?? 'doubao-seed-code-preview-251028';
      llm.baseUrl = process.env.ARK_BASE_URL ?? 'https://ark.cn-beijing.volces.com/api/v3';
    } else if (process.env.ANTHROPIC_API_KEY) {
      llm.provider = 'anthropic';
      llm.apiKey = process.env.ANTHROPIC_API_KEY;
      llm.model = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514';
    } else if (process.env.OPENAI_API_KEY) {
      llm.provider = 'openai';
      llm.apiKey = process.env.OPENAI_API_KEY;
      llm.model = process.env.OPENAI_MODEL ?? 'gpt-4o';
    }

    config.llm = llm;
  }

  // Log level from env
  if (process.env.CHIBI_LOG_LEVEL) {
    config.log = {
      level: process.env.CHIBI_LOG_LEVEL,
      pretty: true,
    };
  }

  return config;
}

/**
 * Deep merge two config objects
 */
function mergeConfigs(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(override)) {
    if (value !== undefined) {
      if (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        typeof result[key] === 'object' &&
        result[key] !== null
      ) {
        result[key] = mergeConfigs(
          result[key] as Record<string, unknown>,
          value as Record<string, unknown>
        );
      } else {
        result[key] = value;
      }
    }
  }

  return result;
}

/**
 * Get default configuration
 */
export function getDefaultConfig(): ChibiConfig {
  return ConfigSchema.parse({});
}
