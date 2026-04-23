import { z } from "zod";

export const appEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_API_URL: z.string().url().optional(),
  DATABASE_URL: z.string().optional(),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  AWS_REGION: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  REDIS_URL: z.string().optional(),
  GREENHOUSE_BOARD_TOKENS: z.string().optional(),
  LEVER_COMPANY_HANDLES: z.string().optional(),
  ASHBY_JOB_BOARD_NAMES: z.string().optional(),
});

export type AppEnv = z.infer<typeof appEnvSchema>;

export function parseAppEnv(input: Record<string, string | undefined>) {
  return appEnvSchema.parse(input);
}

export function splitCsv(input?: string) {
  if (!input) return [];

  return input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
