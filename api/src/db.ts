// Minimal DB interface; implemented by node:sqlite (self-host) and D1 (Cloudflare).
export interface Db {
  all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]>;
  run(sql: string, ...params: unknown[]): Promise<{ id: number; changes: number }>;
}
