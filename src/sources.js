// Where tracks come from. Each function returns a track for the Player:
// { title, detail, url }.

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
  throw new Error(`Cannot play ${parsed.protocol}// addresses`);
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
