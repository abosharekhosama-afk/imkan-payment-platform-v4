/**
 * P16.3 — Document object storage (local filesystem + optional S3-compatible).
 * DEC-005: vendor-neutral; no invented provider APIs beyond standard S3/local.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export type StoredObject = {
  storageKey: string;
  sizeBytes: number;
  sha256: string;
};

function backendMode(): 'local' | 's3' | 'metadata' {
  const raw = (process.env.DOCUMENT_STORAGE_BACKEND || 'local').toLowerCase();
  if (raw === 'metadata') return 'metadata';
  if (raw === 's3') return 's3';
  return 'local';
}

function localRoot(): string {
  return process.env.DOCUMENT_STORAGE_PATH || path.resolve(process.cwd(), '.storage', 'documents');
}

export function isDocumentStorageProduction(): boolean {
  return backendMode() !== 'metadata';
}

/** Production deployments require binary upload (not metadata-only). */
export function requiresDocumentFileUpload(): boolean {
  if (backendMode() === 'metadata') return false;
  return process.env.NODE_ENV === 'production';
}

export function buildStorageKey(organizationId: string, documentId: string, fileName: string): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
  return `${organizationId}/${documentId}/${safe || 'file'}`;
}

function sha256Hex(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function ensureLocalDir(storageKey: string): Promise<string> {
  const full = path.join(localRoot(), storageKey);
  await fs.mkdir(path.dirname(full), {recursive: true});
  return full;
}

async function putLocal(storageKey: string, body: Buffer): Promise<StoredObject> {
  const full = await ensureLocalDir(storageKey);
  await fs.writeFile(full, body);
  return {storageKey, sizeBytes: body.length, sha256: sha256Hex(body)};
}

async function getLocal(storageKey: string): Promise<Buffer> {
  const full = path.join(localRoot(), storageKey);
  return fs.readFile(full);
}

async function putS3(storageKey: string, body: Buffer, mimeType: string): Promise<StoredObject> {
  const bucket = process.env.S3_BUCKET!;
  const region = process.env.S3_REGION!;
  const endpoint = process.env.S3_ENDPOINT?.replace(/\/$/, '');
  const accessKey = process.env.S3_ACCESS_KEY_ID || '';
  const secretKey = process.env.S3_SECRET_ACCESS_KEY || '';
  if (!accessKey || !secretKey) {
    throw new Error('S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY required for DOCUMENT_STORAGE_BACKEND=s3');
  }

  const {S3Client, PutObjectCommand} = await import('@aws-sdk/client-s3');
  const client = new S3Client({
    region,
    endpoint: endpoint || undefined,
    forcePathStyle: Boolean(endpoint),
    credentials: {accessKeyId: accessKey, secretAccessKey: secretKey},
  });
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      Body: body,
      ContentType: mimeType,
    }),
  );
  return {storageKey, sizeBytes: body.length, sha256: sha256Hex(body)};
}

async function getS3(storageKey: string): Promise<Buffer> {
  const bucket = process.env.S3_BUCKET!;
  const region = process.env.S3_REGION!;
  const endpoint = process.env.S3_ENDPOINT?.replace(/\/$/, '');
  const accessKey = process.env.S3_ACCESS_KEY_ID || '';
  const secretKey = process.env.S3_SECRET_ACCESS_KEY || '';
  const {S3Client, GetObjectCommand} = await import('@aws-sdk/client-s3');
  const client = new S3Client({
    region,
    endpoint: endpoint || undefined,
    forcePathStyle: Boolean(endpoint),
    credentials: {accessKeyId: accessKey, secretAccessKey: secretKey},
  });
  const res = await client.send(new GetObjectCommand({Bucket: bucket, Key: storageKey}));
  const chunks: Buffer[] = [];
  const stream = res.Body as AsyncIterable<Uint8Array>;
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export async function putDocumentObject(storageKey: string, body: Buffer, mimeType: string): Promise<StoredObject> {
  if (body.length > 25 * 1024 * 1024) {
    throw new Error('Document exceeds 25MB limit');
  }
  const mode = backendMode();
  if (mode === 'metadata') throw new Error('Document storage backend is metadata-only');
  return mode === 's3' ? putS3(storageKey, body, mimeType) : putLocal(storageKey, body);
}

export async function getDocumentObject(storageKey: string): Promise<Buffer> {
  const mode = backendMode();
  if (mode === 'metadata') throw new Error('Document storage backend is metadata-only');
  return mode === 's3' ? getS3(storageKey) : getLocal(storageKey);
}

export async function getDocumentDownloadUrl(storageKey: string, ttlSec = 900): Promise<string | null> {
  if (backendMode() !== 's3') return null;
  const bucket = process.env.S3_BUCKET!;
  const region = process.env.S3_REGION!;
  const endpoint = process.env.S3_ENDPOINT?.replace(/\/$/, '');
  const accessKey = process.env.S3_ACCESS_KEY_ID || '';
  const secretKey = process.env.S3_SECRET_ACCESS_KEY || '';
  const {S3Client, GetObjectCommand} = await import('@aws-sdk/client-s3');
  const {getSignedUrl} = await import('@aws-sdk/s3-request-presigner');
  const client = new S3Client({
    region,
    endpoint: endpoint || undefined,
    forcePathStyle: Boolean(endpoint),
    credentials: {accessKeyId: accessKey, secretAccessKey: secretKey},
  });
  return getSignedUrl(client, new GetObjectCommand({Bucket: bucket, Key: storageKey}), {expiresIn: ttlSec});
}

export function documentStorageBackendForTests(): string {
  return backendMode();
}
