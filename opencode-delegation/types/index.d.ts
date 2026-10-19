// What the delegation script reads from ~/.codex/opencode-model.json.
// `variant` is the effort name, or '' for a model without variants.
export type ModelConfig = { model: string; variant: string }

export type Catalog = {
  models: string[]
  variants: Record<string, string[]>
  // Why the variants could not be loaded, or null.
  variantsError: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'opencode-delegation': {
      config: ModelConfig | null
      catalog: Catalog | null
      installed: { version: string } | null
      error: string | null
      isLoading: boolean
    }
  }
}
