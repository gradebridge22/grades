import type { NextConfig } from 'next';
const config: NextConfig = {
  serverExternalPackages: ['@electric-sql/pglite', 'postgres'],
  poweredByHeader: false,
  outputFileTracingIncludes: { '/**': ['./supabase/**/*.sql'] },
};
export default config;
