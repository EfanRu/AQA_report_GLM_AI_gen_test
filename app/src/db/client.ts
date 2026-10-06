import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export const databaseUrl =
  process.env.DATABASE_URL ?? 'postgres://testreport:testreport@localhost:5432/testreport';

const client = postgres(databaseUrl, {
  max: 5,
  // bigserial (int8) по умолчанию приходит строкой — парсим в number, чтобы рантайм
  // соответствовал типам Drizzle (id << 2^53, точность не теряется)
  types: {
    bigint: {
      to: 20,
      from: [20],
      parse: (x: string) => Number(x),
      serialize: (x: number) => String(x),
    },
  },
});

export const db = drizzle(client, { schema });
