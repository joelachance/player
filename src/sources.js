// Where tracks come from. Each function returns a track for the Player:
// { title, detail, url }.

import * as s3 from './s3.js';

/** A file the user picked or dropped. */
export function fromFile(file) {
  let url;
  return {
    title: file.name,
    detail: 'Local file',
    url: () => (url ??= URL.createObjectURL(file)),
  };
}

/**
 * A file in the folder the server was started with (`node server.js --dir`).
 * `list` is the address the folder's listing came from.
 */
export function fromFolder(name, list) {
  const path = `/media/${name.split('/').map(encodeURIComponent).join('/')}`;
  return {
    title: name,
    detail: 'Local folder',
    url: () => new URL(path, list).href,
  };
}

/**
 * A full address: http(s) or s3://. Throws with a message fit to show.
 * `signer` is the endpoint that presigns S3 addresses, if there is one;
 * `title` replaces the file name.
 */
export function fromAddress(text, { signer, title } = {}) {
  const address = text.trim();
  if (!address) throw new Error('Type an address first');
  let parsed;
  try {
    parsed = new URL(address);
  } catch {
    throw new Error('That is not a full address');
  }
  if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
    // A pasted S3 "Object URL" or console address is unsigned, so a private
    // object would be refused. Sign it like an s3:// address instead.
    const object = s3.locate(address);
    const consolePage = /console\.aws\.amazon\.com$/.test(parsed.hostname);
    if (object && (signer || consolePage)) {
      return fromS3(`s3://${object.bucket}/${object.key}`, { signer, title, open: consolePage ? undefined : parsed.href });
    }
    return { title: title ?? (basename(parsed.pathname) || parsed.host), detail: parsed.host, url: () => parsed.href };
  }
  if (parsed.protocol === 's3:' || parsed.protocol === 'arn:') return fromS3(address, { signer, title });
  throw new Error(`Cannot play ${parsed.protocol}// addresses`);
}

/**
 * An object in S3, as s3://bucket/key. With a signer, a short-lived
 * address is signed for it each time it starts playing. With none, or
 * one that has no AWS credentials, the object is tried as a public one,
 * at `open` if given. When the signer says why S3 refused, that is the
 * error the listener sees.
 */
export function fromS3(address, { signer, title, open } = {}) {
  const object = s3.parse(address);
  const unsigned = open ?? s3.open(object);
  return {
    title: title ?? basename(object.key),
    detail: `s3://${object.bucket}`,
    async url() {
      if (!signer) return unsigned;
      let reply;
      try {
        const ask = new URL(signer, document.baseURI);
        ask.searchParams.set('uri', `s3://${object.bucket}/${object.key}`);
        reply = await fetch(ask);
      } catch {
        return unsigned;
      }
      if (reply.ok) return (await reply.json()).url;
      if (reply.status === 501 || reply.status === 404) return unsigned;
      throw new Error((await reply.text()) || 'Could not sign this S3 address');
    },
  };
}

export const isWav = (file) => /\.wave?$/i.test(file.name) || /^audio\/(x-)?wav/.test(file.type);

function basename(path) {
  const last = path.split('/').filter(Boolean).pop() ?? '';
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}
