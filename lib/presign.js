// Presigned S3 GET addresses (AWS Signature Version 4, query-string form),
// so the browser can play a private object without ever holding a key.

import { execFile } from 'node:child_process';
import { createHash, createHmac } from 'node:crypto';
import { encode, host as hostFor, path } from '../src/s3.js';

const hmac = (key, text) => createHmac('sha256', key).update(text).digest();
const hex = (text) => createHash('sha256').update(text).digest('hex');

/**
 * An address that reads s3://bucket/key for `expires` seconds.
 * `credentials` is { accessKeyId, secretAccessKey, sessionToken? }.
 */
export function presign({ bucket, key, region, credentials, expires = 3600, now = new Date(), host = hostFor(bucket, region) }) {
  const stamp = now.toISOString().replace(/[-:]|\.\d{3}/g, ''); // 20260102T030405Z
  const day = stamp.slice(0, 8);
  const scope = `${day}/${region}/s3/aws4_request`;
  const uri = path(bucket, key);

  const query = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${credentials.accessKeyId}/${scope}`,
    'X-Amz-Date': stamp,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': 'host',
  };
  if (credentials.sessionToken) query['X-Amz-Security-Token'] = credentials.sessionToken;
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((name) => `${encode(name)}=${encode(query[name])}`)
    .join('&');

  const request = ['GET', uri, canonicalQuery, `host:${host}`, '', 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', stamp, scope, hex(request)].join('\n');
  const signingKey = ['aws4_request'].reduce(hmac, hmac(hmac(hmac(`AWS4${credentials.secretAccessKey}`, day), region), 's3'));
  const signature = hmac(signingKey, toSign).toString('hex');

  return `https://${host}${uri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

let cached = null;

/**
 * AWS credentials: the usual environment variables, or else whatever the
 * AWS CLI resolves (profiles, SSO), asked once and kept until it expires.
 * Resolves to null when there are none.
 */
export async function credentials(env = process.env) {
  if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
    return {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      sessionToken: env.AWS_SESSION_TOKEN || undefined,
    };
  }
  if (cached && (!cached.expires || cached.expires - Date.now() > 5 * 60_000)) return cached;
  cached = await new Promise((done, fail) => {
    execFile('aws', ['configure', 'export-credentials', '--format', 'process'], { timeout: 15_000 }, (failed, output, complaint) => {
      if (failed) {
        // No CLI, or nothing configured: there are simply no credentials.
        // A login that has lapsed is different, and worth saying out loud.
        const why = String(complaint).trim().split('\n').pop() ?? '';
        if (/sso|expired|token|refresh/i.test(why)) return fail(new Error(`AWS login needs renewing (try: aws sso login). ${why}`));
        return done(null);
      }
      try {
        const found = JSON.parse(output);
        if (!found.AccessKeyId || !found.SecretAccessKey) return done(null);
        done({
          accessKeyId: found.AccessKeyId,
          secretAccessKey: found.SecretAccessKey,
          sessionToken: found.SessionToken || undefined,
          expires: found.Expiration ? Date.parse(found.Expiration) : 0,
        });
      } catch {
        done(null);
      }
    });
  });
  return cached;
}

/** Forget credentials fetched from the AWS CLI, so the next call asks again. */
export function forget() {
  cached = null;
}

/**
 * Asks S3 for the first byte through a signed address. Resolves to null
 * when it can be read (or S3 cannot be reached to say), and otherwise to
 * a sentence saying why not. The browser cannot learn this itself: an
 * audio element is told only that loading failed.
 */
export async function refusal(url, { bucket, key }) {
  let reply;
  try {
    reply = await fetch(url, { headers: { Range: 'bytes=0-0' }, signal: AbortSignal.timeout(8000) });
  } catch {
    return null;
  }
  if (reply.ok) {
    await reply.body?.cancel();
    return null;
  }
  const body = await reply.text();
  const code = /<Code>([^<]+)<\/Code>/.exec(body)?.[1] ?? String(reply.status);
  const said = /<Message>([^<]+)<\/Message>/.exec(body)?.[1] ?? '';
  return explain(code, said, { bucket, key });
}

/** What an S3 error code means for someone trying to play a file. */
export function explain(code, said, { bucket, key }) {
  switch (code) {
    case 'AccessDenied':
      return `S3 denied access to s3://${bucket}/${key}. These AWS credentials need s3:GetObject on it (and kms:Decrypt if the bucket uses a KMS key). S3 also answers this way when the object does not exist and the credentials may not list the bucket.`;
    case 'NoSuchKey':
      return `There is no "${key}" in bucket ${bucket}. Check the path; it is case-sensitive.`;
    case 'NoSuchBucket':
      return `There is no bucket named ${bucket}.`;
    case 'ExpiredToken':
    case 'TokenRefreshRequired':
      return 'The AWS session has expired. Log in again (aws sso login) and press play.';
    case 'InvalidAccessKeyId':
    case 'SignatureDoesNotMatch':
    case 'InvalidToken':
      return `S3 did not accept these AWS credentials (${code}). Check which profile or keys the server was started with.`;
    case 'InvalidObjectState':
      return 'This object is archived (Glacier) and must be restored before it can be played.';
    case 'PermanentRedirect':
    case 'AuthorizationHeaderMalformed':
    case 'IllegalLocationConstraintException':
      return `The request went to the wrong region for bucket ${bucket}. Set AWS_REGION to the bucket's region and restart the server.`;
    default:
      return `S3 refused s3://${bucket}/${key}: ${code}${said ? ` (${said})` : ''}`;
  }
}

const regions = new Map();

/** The region a bucket lives in. S3 says so in a header even when it refuses the request. */
export async function regionOf(bucket, env = process.env) {
  if (regions.has(bucket)) return regions.get(bucket);
  let region = env.AWS_REGION || env.AWS_DEFAULT_REGION || 'us-east-1';
  try {
    const reply = await fetch(`https://${hostFor(bucket)}${bucket.includes('.') ? `/${bucket}` : '/'}`, {
      method: 'HEAD',
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
    });
    const told = reply.headers.get('x-amz-bucket-region');
    if (told) {
      region = told;
      regions.set(bucket, region);
    }
  } catch {
    // Offline or blocked: go with the configured region.
  }
  return region;
}
