import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  isClientDevMode,
  isLocalPostgresMode,
  isSupabaseConfigured,
} from '@/lib/db/runtime-mode';

describe('runtime-mode', () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
  });

  afterEach(() => {
    process.env = env;
    vi.unstubAllEnvs();
  });

  it('detects local postgres mode when DEV_MODE and DATABASE_URL are set', () => {
    vi.stubEnv('DEV_MODE', 'true');
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost/teto');
    vi.stubEnv('NODE_ENV', 'development');
    expect(isLocalPostgresMode()).toBe(true);
  });

  it('does not use local postgres mode when only DATABASE_URL is set', () => {
    vi.stubEnv('DEV_MODE', 'false');
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost/teto');
    expect(isLocalPostgresMode()).toBe(false);
  });

  it('disables local postgres mode in production even with DEV_MODE', () => {
    vi.stubEnv('DEV_MODE', 'true');
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost/teto');
    vi.stubEnv('NODE_ENV', 'production');
    expect(isLocalPostgresMode()).toBe(false);
  });

  it('detects client dev mode from NEXT_PUBLIC_DEV_MODE', () => {
    vi.stubEnv('NEXT_PUBLIC_DEV_MODE', 'true');
    vi.stubEnv('NODE_ENV', 'development');
    expect(isClientDevMode()).toBe(true);
  });

  it('detects supabase configuration', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
    expect(isSupabaseConfigured()).toBe(true);
  });
});
