import { z } from "zod";

const optionalString = z.string().trim().min(1).optional();

function required(message: string) {
  return z.string(message).trim().min(1, message);
}

export const envSchema = z.object({
  bucket: required("S3_BUCKET or AWS_BUCKET is required"),
  accessKeyId: required("S3_ACCESS_KEY_ID or AWS_ACCESS_KEY_ID is required"),
  secretAccessKey: required("S3_SECRET_ACCESS_KEY or AWS_SECRET_ACCESS_KEY is required"),
  region: optionalString,
  endpoint: z.url("S3_ENDPOINT / AWS_ENDPOINT must be a URL").optional(),
  sessionToken: optionalString,
});

export type Env = z.infer<typeof envSchema>;

function read(s3Key: string, awsKey: string) {
  const value = process.env[s3Key] ?? process.env[awsKey];
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function loadEnv(
  overrides: {
    bucket?: string;
    endpoint?: string;
    region?: string;
  } = {},
): Env {
  const result = envSchema.safeParse({
    bucket: overrides.bucket || read("S3_BUCKET", "AWS_BUCKET"),
    accessKeyId: read("S3_ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID"),
    secretAccessKey: read("S3_SECRET_ACCESS_KEY", "AWS_SECRET_ACCESS_KEY"),
    region: overrides.region || read("S3_REGION", "AWS_REGION"),
    endpoint: overrides.endpoint || read("S3_ENDPOINT", "AWS_ENDPOINT"),
    sessionToken: read("S3_SESSION_TOKEN", "AWS_SESSION_TOKEN"),
  });

  if (!result.success) {
    console.error(`Invalid environment:\n${z.prettifyError(result.error)}`);
    process.exit(1);
  }

  return result.data;
}
