// <wav-player>: the whole player as one custom element, so it can sit on
// any page. Its markup and skin live in a shadow root, where the page's
// own CSS cannot reach them and theirs cannot leak out.
//
//   <script type="module" src="https://your.host/player/src/element.js"></script>
//   <wav-player src="https://your.host/takes/kick.wav" skin="midnight"></wav-player>
//
// Attributes:
//   src        one track: an http(s) address (relative is fine) or s3://bucket/key
//   skin       a skin's name from skins/, or the address of your own skin sheet
//   editable   the listener may add and remove tracks (address box, file picker, drop)
//   skin-menu  show the skin menu
//   signer     address of an endpoint that presigns s3:// addresses (see server.js);
//              without one, S3 objects are fetched as public ones
//   folder     address of a JSON list of WAVs to load (the server's /api/local)
//   page       the player is the whole page: fills it, and remembers the skin
//
// Several tracks go inside the element as links, which also serve as the
// fallback when scripts are off:
//
//   <wav-player>
//     <a href="takes/kick.wav">Kick</a>
//     <a href="s3://my-bucket/takes/snare.wav">Snare</a>
//   </wav-player>
//
// From script: element.player is the Player (events, play(), seek() …),
// and element.add(address or File, title) appends a track.

import { markup } from './markup.js';
import { Player } from './player.js';
import { fromAddress, fromFile, fromFolder } from './sources.js';
import { wire } from './ui.js';

const home = new URL('../', import.meta.url);
const NAME = /^[\w-]+$/;
const all = new Set();

export class WavPlayer extends HTMLElement {
  static observedAttributes = ['src', 'skin', 'editable', 'skin-menu'];

  player = new Player();
  #ui;
  #skin;
  #ready = false;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    // Hidden until base.css arrives and shows it, so it never flashes unstyled.
    root.innerHTML = `
      <style>:host { display: block; } .player { visibility: hidden; }</style>
      <link rel="stylesheet" href="${new URL('skins/base.css', home)}">
      <link rel="stylesheet" id="skin" href="${new URL('skins/default.css', home)}">
      ${markup}`;
    this.#skin = root.getElementById('skin');

    // One voice per page: starting a player pauses the others.
    all.add(this.player);
    this.player.audio.addEventListener('play', () => {
      for (const other of all) if (other !== this.player) other.audio.pause();
    });
    this.#ui = wire(root, this, this.player, () => ({
      editable: this.hasAttribute('editable'),
      skinMenu: this.hasAttribute('skin-menu'),
      page: this.hasAttribute('page'),
      signer: this.getAttribute('signer'),
    }));
  }

  connectedCallback() {
    if (this.#ready) return;
    this.#ready = true;

    if (this.hasAttribute('page')) {
      let saved = null;
      try {
        saved = localStorage.getItem('skin');
      } catch {}
      const wanted = new URLSearchParams(location.search).get('skin') ?? saved;
      if (wanted && NAME.test(wanted)) this.setAttribute('skin', wanted);
    }
    this.#wear();
    this.#load();

    const folder = this.getAttribute('folder');
    if (folder) {
      const list = new URL(folder, document.baseURI);
      fetch(list)
        .then((reply) => (reply.ok ? reply.json() : []))
        .then((names) => this.player.add(...names.map((name) => fromFolder(name, list))))
        .catch(() => {});
    }
  }

  attributeChangedCallback(name, before, now) {
    if (!this.#ready || before === now) return;
    if (name === 'src') this.#load();
    else if (name === 'skin') this.#wear();
    else this.#ui.draw();
  }

  /** Appends a track: an address (http(s) or s3://) or a File. */
  add(source, title) {
    const track =
      typeof source === 'string'
        ? fromAddress(absolute(source), { signer: this.getAttribute('signer'), title })
        : fromFile(source);
    this.player.add(track);
    return track;
  }

  // The tracks written in the page: the src attribute, then the links inside.
  #load() {
    this.player.clear();
    const written = [];
    if (this.getAttribute('src')) written.push([this.getAttribute('src')]);
    for (const link of this.querySelectorAll(':scope > a[href]')) {
      written.push([link.getAttribute('href'), link.textContent.trim() || undefined]);
    }
    for (const [address, title] of written) {
      try {
        this.add(address, title);
      } catch (problem) {
        console.warn(`wav-player: skipped "${address}": ${problem.message}`);
      }
    }
  }

  #wear() {
    const skin = this.getAttribute('skin') || 'default';
    this.#skin.href = NAME.test(skin) ? new URL(`skins/${skin}.css`, home) : new URL(skin, document.baseURI);
    this.#ui.skin(skin);
    if (this.hasAttribute('page') && NAME.test(skin)) {
      try {
        localStorage.setItem('skin', skin);
      } catch {}
    }
  }
}

// Addresses in a page are relative to that page, as in <a href> and <img src>.
function absolute(address) {
  const text = address.trim();
  if (/^s3:/i.test(text)) return text;
  try {
    return new URL(text, document.baseURI).href;
  } catch {
    return text;
  }
}

if (!customElements.get('wav-player')) customElements.define('wav-player', WavPlayer);
