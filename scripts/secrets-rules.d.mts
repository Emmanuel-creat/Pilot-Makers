export const SECRET_RULES: { id: string; label: string; re: RegExp }[];
export const ALLOW_MARK: string;
export function scanText(text: string): { line: number; rule: string; label: string }[];
export function forbiddenFile(path: string): boolean;
