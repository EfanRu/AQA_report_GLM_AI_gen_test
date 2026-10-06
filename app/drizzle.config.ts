import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  schemaFilter: ['testreport'],
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://testreport:testreport@localhost:5432/testreport',
  },
});
