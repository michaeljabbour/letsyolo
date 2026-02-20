export type AgentType = 'claude-code' | 'codex' | 'copilot' | 'amplifier';

export interface AgentDefinition {
  type: AgentType;
  displayName: string;
  binaries: string[];
  versionFlag: string;
  installCommand: string;
  yoloFlag: string;
  configPath?: string;
  configFormat: 'json' | 'toml' | 'none';
  persistentToggle: boolean;
}

export interface AgentStatus {
  type: AgentType;
  displayName: string;
  installed: boolean;
  version: string | null;
  path: string | null;
  installCommand: string;
}

export interface DetectionResult {
  agents: AgentStatus[];
  checkedAt: number;
}

export interface YoloConfig {
  /** Whether yolo mode is currently enabled in persistent config */
  enabled: boolean;
  /** Whether this agent has only session-level yolo support */
  sessionOnly: boolean;
  /** Path to the config file, if persistent config exists */
  configPath?: string;
  /** The CLI flag for per-session yolo */
  cliFlag: string;
  /** Description of what was configured */
  details: string;
}

export interface YoloResult {
  type: AgentType;
  displayName: string;
  success: boolean;
  error?: string;
  config?: YoloConfig;
}
