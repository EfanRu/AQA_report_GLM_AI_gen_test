import { z } from 'zod';

export const CategorySchema = z.enum(['product', 'auto', 'env', 'flaky', 'other']);

export const buildQuery = z.object({
  build: z.string().trim().min(1).max(200),
});

export const deltaQuery = buildQuery.extend({
  afterId: z.coerce.number().int().nonnegative(),
});

export const attemptsQuery = buildQuery.extend({
  testDefId: z.coerce.number().int().positive(),
});

export const commentPut = z.object({
  testDefIds: z.array(z.coerce.number().int().positive()).min(1).max(500),
  build: z.string().trim().min(1).max(200),
  category: CategorySchema,
  body: z.string().trim().min(1).max(4000),
  author: z.string().trim().min(1).max(100),
});

export const missingQuery = z.object({
  runId: z.coerce.number().int().positive(),
  baselineRunId: z.coerce.number().int().positive().optional(),
});
