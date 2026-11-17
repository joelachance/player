// S3 addresses. No DOM and no Node here: the page and the server both use it.

const BUCKET = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

/**
 * Splits "s3://bucket/path/to/take.wav" into { bucket, key }. Also takes
 * the ARN form, "arn:aws:s3:::bucket/path/to/take.wav". Throws otherwise.
 */
export function parse(address) {
  const found = /^(?:s3:\/\/|arn:aws[\w-]*:s3:::)([^/]+)\/(.+)$/.exec(address.trim());
  if (!found) throw new Error('S3 addresses look like s3://bucket/path/file.wav');
  const [, bucket, key] = found;
  if (!BUCKET.test(bucket) || bucket.includes('..')) throw new Error(`"${bucket}" is not a bucket name`);
  return { bucket, key };
}

/**
 * The object an https address points at, if it is an unsigned S3 one:
 * the "Object URL" or the browser address of the object's console page,
 * which are what people usually have on the clipboard. Null otherwise,
 * and null for an address that already carries a signature.
 */
export function locate(address) {
  let url;
  try {
    url = new URL(address);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.searchParams.has('X-Amz-Signature') || url.searchParams.has('Signature')) return null;
  // S3 reads "+" in a path as a space, and the console writes it that way.
  const plain = (text) => decodeURIComponent(text.replace(/\+/g, ' '));
  let bucket;
  let key;
  try {
    const hosted = /^(.+)\.s3[.-](?:[a-z0-9-]+\.)?amazonaws\.com$/.exec(url.hostname);
    if (hosted) {
      bucket = hosted[1];
      key = plain(url.pathname.slice(1));
    } else if (/^s3[.-](?:[a-z0-9-]+\.)?amazonaws\.com$/.test(url.hostname)) {
      const [, first, ...rest] = url.pathname.split('/');
      bucket = first;
      key = plain(rest.join('/'));
    } else if (/(^|\.)console\.aws\.amazon\.com$/.test(url.hostname)) {
      const page = /^\/s3\/object\/([^/]+)$/.exec(url.pathname);
      if (!page) return null;
      bucket = page[1];
      key = url.searchParams.get('prefix') ?? '';
    } else {
      return null;
    }
  } catch {
    return null;
  }
  if (!key || !BUCKET.test(bucket) || bucket.includes('..')) return null;
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
