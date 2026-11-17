// S3 addresses. No DOM and no Node here: the page and the server both use it.

const BUCKET = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

/** Splits "s3://bucket/path/to/take.wav" into { bucket, key }. Throws if it is not one. */
export function parse(address) {
  const found = /^s3:\/\/([^/]+)\/(.+)$/.exec(address.trim());
  if (!found) throw new Error('S3 addresses look like s3://bucket/path/file.wav');
  const [, bucket, key] = found;
  if (!BUCKET.test(bucket) || bucket.includes('..')) throw new Error(`"${bucket}" is not a bucket name`);
  return { bucket, key };
}

/** The address of an object that anyone may read, with no signature. */
export function open({ bucket, key }) {
  return `https://${host(bucket)}${path(bucket, key)}`;
}

/** The host to ask for a bucket. Dotted names break the wildcard certificate, so they go in the path. */
export function host(bucket, region) {
  const endpoint = region ? `s3.${region}.amazonaws.com` : 's3.amazonaws.com';
  return bucket.includes('.') ? endpoint : `${bucket}.${endpoint}`;
}

/** The request path of an object, encoded the way S3 signs it. */
export function path(bucket, key) {
  const object = key.split('/').map(encode).join('/');
  return bucket.includes('.') ? `/${bucket}/${object}` : `/${object}`;
}

/** Percent-encoding as AWS wants it: everything but letters, digits and - _ . ~ */
export function encode(text) {
  return encodeURIComponent(text).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}
