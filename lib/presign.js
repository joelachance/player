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
  cached = await new Promise((done) => {
    execFile('aws', ['configure', 'export-credentials', '--format', 'process'], { timeout: 15_000 }, (failed, output) => {
      if (failed) return done(null);
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
