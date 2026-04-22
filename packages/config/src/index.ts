import { z } from "zod";

export const appEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_API_URL: z.string().url().optional(),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  AWS_REGION: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  REDIS_URL: z.string().optional(),
});

export type AppEnv = z.infer<typeof appEnvSchema>;

export function parseAppEnv(input: Record<string, string | undefined>) {
  return appEnvSchema.parse(input);
}

