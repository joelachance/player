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

/** A file in the folder the server was started with (`node server.js --dir`). */
export function fromFolder(name) {
  return {
    title: name,
    detail: 'Local folder',
    url: () => `/media/${name.split('/').map(encodeURIComponent).join('/')}`,
  };
}

/** Whatever was typed into the address box. Throws with a message fit to show. */
export function fromAddress(text) {
  const address = text.trim();
  if (!address) throw new Error('Type an address first');
  let parsed;
  try {
    parsed = new URL(address);
  } catch {
    throw new Error('That is not a full address');
  }
  if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
    return { title: basename(parsed.pathname) || parsed.host, detail: parsed.host, url: () => parsed.href };
  }
  if (parsed.protocol === 's3:') return fromS3(address);
  throw new Error(`Cannot play ${parsed.protocol}// addresses`);
}

/**
 * An object in S3, as s3://bucket/key. The local server signs a
 * short-lived address for it each time it starts playing; with no server
 * or no AWS credentials, the object is tried as a public one.
 */
export function fromS3(address) {
  const object = s3.parse(address);
  return {
    title: basename(object.key),
    detail: `s3://${object.bucket}`,
    async url() {
      let reply;
      try {
        reply = await fetch(`/api/presign?uri=${encodeURIComponent(address.trim())}`);
      } catch {
        return s3.open(object);
      }
      if (reply.ok) return (await reply.json()).url;
      if (reply.status === 501 || reply.status === 404) return s3.open(object);
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
