// Real ProviderClient backed by OpenAI. Kept behind the ProviderClient seam so
// the rest of the system never depends on a specific model vendor — swapping
// providers means swapping this one factory. Uses the global fetch (available
// in both Deno and the browser), but the API key is passed in by the caller and
// only ever supplied server-side (Edge Function secret) — never in the browser.

import type { ProviderClient } from './personality.ts'

export const DEFAULT_MODEL = 'gpt-4.1'

interface OpenAIOptions {
  model?: string
  /** Low temperature: persona inference should be stable, not creative. */
  temperature?: number
  /** Override the endpoint (tests/self-host); defaults to OpenAI. */
  endpoint?: string
}

/** Construct an OpenAI-backed ProviderClient. */
export function createOpenAIProvider(apiKey: string, opts: OpenAIOptions = {}): ProviderClient {
  const model = opts.model ?? DEFAULT_MODEL
  const temperature = opts.temperature ?? 0.3
  const endpoint = opts.endpoint ?? 'https://api.openai.com/v1/chat/completions'

  return {
    async complete({ system, user, schema, text }) {
      // Shape the response: strict structured output (schema) wins; then plain
      // text; otherwise a JSON object (the historical default).
      const response_format = schema
        ? { type: 'json_schema', json_schema: { name: schema.name, strict: true, schema: schema.schema } }
        : text
          ? undefined
          : { type: 'json_object' }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature,
          ...(response_format ? { response_format } : {}),
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      })

      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw new Error(`OpenAI ${res.status}: ${detail.slice(0, 200)}`)
      }

      const data = await res.json()
      const content = data?.choices?.[0]?.message?.content
      if (typeof content !== 'string' || content.trim().length === 0) {
        throw new Error('OpenAI returned an empty completion')
      }
      return content
    },
  }
}
