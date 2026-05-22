import { S3Client } from "@aws-sdk/client-s3";

const ENDPOINT_KEY = "s3_endpoint";
const KEY_ID_KEY = "s3_key_id";
const SECRET_KEY = "s3_secret";

export interface S3Settings {
  endpoint: string;
  keyId: string;
  secret: string;
}

export function getS3Settings(): S3Settings {
  return {
    endpoint: localStorage.getItem(ENDPOINT_KEY) ?? "",
    keyId: localStorage.getItem(KEY_ID_KEY) ?? "",
    secret: localStorage.getItem(SECRET_KEY) ?? "",
  };
}

export function setS3Settings(s: S3Settings): void {
  localStorage.setItem(ENDPOINT_KEY, s.endpoint);
  localStorage.setItem(KEY_ID_KEY, s.keyId);
  localStorage.setItem(SECRET_KEY, s.secret);
}

export function createS3Client(settings?: S3Settings): S3Client {
  const { endpoint, keyId, secret } = settings ?? getS3Settings();
  return new S3Client({
    endpoint: endpoint || undefined,
    region: "garage",
    credentials: { accessKeyId: keyId || "anon", secretAccessKey: secret || "anon" },
    forcePathStyle: true,
  });
}

let _s3: S3Client | null = null;

export function getS3Client(): S3Client {
  if (!_s3) _s3 = createS3Client();
  return _s3;
}

export function refreshS3Client(): void {
  _s3 = createS3Client();
}

export function s3Configured(): boolean {
  const { keyId, secret } = getS3Settings();
  return !!(keyId && secret);
}
