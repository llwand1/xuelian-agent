/** Chat backend contract; distinct from the task-delegation/MCP plugin. */
export interface ExternalAgentSettings {
  enabled: boolean;
  name: string;
  /** OpenAI-compatible base URL, not the complete /chat/completions URL. */
  baseUrl: string;
  model: string;
  timeoutSeconds: number;
  historyMessages: number;
}
export interface ExternalAgentView {
  supported: boolean;
  settings: ExternalAgentSettings;
  tokenConfigured: boolean;
}
export interface ExternalAgentPatch extends ExternalAgentSettings {
  /** Omitted preserves a saved token only when the endpoint is unchanged. Empty clears it. */
  token?: string;
}
export interface ExternalAgentProbe {
  ok: boolean;
  models: string[];
  message: string;
}
export const DEFAULT_EXTERNAL_AGENT: ExternalAgentSettings = {
  enabled: false, name: 'Codex 本地 Agent', baseUrl: 'http://127.0.0.1:4012/v1',
  model: 'default', timeoutSeconds: 180, historyMessages: 40,
};
