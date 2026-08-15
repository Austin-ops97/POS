export function readEnvFile(filename: string): Record<string, string>;
export function isPlaceholderEnvValue(
  key: string,
  value: string | undefined
): boolean;
export function envWithLocalOverrides(
  baseEnv?: NodeJS.ProcessEnv
): NodeJS.ProcessEnv;
export function applyLocalEnvOverrides(): void;
