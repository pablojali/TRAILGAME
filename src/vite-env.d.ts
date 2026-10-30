/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL, e.g. https://abcd.supabase.co (optional; see docs/SUPABASE_SETUP.md). */
  readonly VITE_SUPABASE_URL?: string
  /** Supabase anon/publishable key. Never a service-role or secret key. */
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
