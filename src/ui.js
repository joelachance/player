// Wires one copy of the markup to a Player. All looks live in skins/; this
// file only reads ids and sets text, attributes and data-state.
//
// `root` holds the markup (a shadow root), `host` is the element the
// player sits in, and `options` is read afresh on each draw:
// { editable, skinMenu, page, signer }.

import { fromAddress, fromFile, isWav } from './sources.js';

export function wire(root, host, player, options) {
  const $ = (id) => root.getElementById(id);
  const frame = root.querySelector('.player');

  // ---- playback --------------------------------------------------------

  $('toggle').addEventListener('click', () => player.toggle());
  $('next').addEventListener('click', () => player.next());
  $('prev').addEventListener('click', () => player.prev());
  $('volume').addEventListener('input', (event) => {
    player.volume = Number(event.target.value);
    fill(event.target);
  });

  let seeking = false;
  $('seek').addEventListener('input', (event) => {
    seeking = true;
    $('elapsed').textContent = clock(Number(event.target.value));
    fill(event.target);
  });
  $('seek').addEventListener('change', (event) => {
    player.seek(Number(event.target.value));
    seeking = false;
  });

  // Space plays and pauses: anywhere on the player's own page, but only
  // with focus inside the player when it is a guest on someone else's.
  (options().page ? document : root).addEventListener('keydown', (event) => {
    const target = event.composedPath()[0];
    if (event.code !== 'Space' || target.closest?.('input, select, button, a, textarea, [contenteditable]')) return;
    event.preventDefault();
    player.toggle();
  });

  player.addEventListener('state', () => {
    frame.dataset.state = player.state;
    $('toggle').setAttribute('aria-label', player.state === 'playing' ? 'Pause' : 'Play');
  });

  player.addEventListener('track', () => {
    frame.classList.remove('player--error');
    draw();
    drawTime();
  });

  player.addEventListener('error', () => {
    $('detail').textContent = player.error;
    frame.classList.add('player--error');
  });

  player.addEventListener('time', drawTime);
  player.addEventListener('tracks', draw);

  function drawTime() {
    const seek = $('seek');
    seek.disabled = !player.duration;
    seek.max = player.duration || 1;
    $('duration').textContent = clock(player.duration);
    if (seeking) return;
    seek.value = player.time;
    $('elapsed').textContent = clock(player.time);
    fill(seek);
  }

  function draw() {
    const { editable, skinMenu } = options();

    // Before anything has played, the first track is shown as cued.
    const track = player.current ?? player.tracks[0];
    $('title').textContent = track?.title ?? 'Nothing playing';
    if (!frame.classList.contains('player--error')) {
      $('detail').textContent = track?.detail ?? (editable ? 'Add a WAV file to start' : '');
    }

    $('list').replaceChildren(
      ...player.tracks.map((track, index) => {
        const item = document.createElement('li');
        item.className = 'track';
        item.part = index === player.index ? 'track current' : 'track';
        if (index === player.index) item.setAttribute('aria-current', 'true');

        const play = document.createElement('button');
        play.type = 'button';
        play.className = 'track__play';
        play.addEventListener('click', () => player.play(index));
        const title = document.createElement('span');
        title.className = 'track__title';
        title.part = 'track-title';
        title.textContent = track.title;
        const detail = document.createElement('span');
        detail.className = 'track__detail';
        detail.part = 'track-detail';
        detail.textContent = track.detail;
        play.append(title, detail);
        item.append(play);

        if (editable) {
          const remove = document.createElement('button');
          remove.type = 'button';
          remove.className = 'track__remove';
          remove.part = 'track-remove';
          remove.setAttribute('aria-label', `Remove ${track.title}`);
          remove.textContent = '×';
          remove.addEventListener('click', () => player.remove(index));
          item.append(remove);
        }
        return item;
      }),
    );

    // A lone track that cannot be changed needs no list under it.
    $('list').hidden = player.tracks.length === 0 || (player.tracks.length === 1 && !editable);
    $('add').hidden = !editable;
    $('empty').hidden = !editable || player.tracks.length > 0;
    $('footer').hidden = !skinMenu;
    if (skinMenu) loadSkins();
  }

  // ---- adding tracks ---------------------------------------------------

  $('add').addEventListener('submit', (event) => {
    event.preventDefault();
    const box = $('source');
    try {
      add([fromAddress(box.value, { signer: options().signer })]);
      box.value = '';
      box.setCustomValidity('');
    } catch (problem) {
      box.setCustomValidity(problem.message);
      box.reportValidity();
    }
  });
  $('source').addEventListener('input', (event) => event.target.setCustomValidity(''));

  $('files').addEventListener('change', (event) => {
    addFiles(event.target.files);
    event.target.value = '';
  });

  host.addEventListener('dragover', (event) => {
    if (!options().editable) return;
    event.preventDefault();
    frame.classList.add('player--drop');
  });
  host.addEventListener('dragleave', () => frame.classList.remove('player--drop'));
  host.addEventListener('drop', (event) => {
    if (!options().editable) return;
    event.preventDefault();
    frame.classList.remove('player--drop');
    addFiles(event.dataTransfer.files);
  });

  function addFiles(files) {
    add([...files].filter(isWav).map(fromFile));
  }

  // Tracks the listener adds start playing; tracks the page came with wait for a click.
  function add(tracks) {
    if (!tracks.length) return;
    const first = player.tracks.length;
    player.add(...tracks);
    if (player.index < 0) player.play(first);
  }

  // ---- skin menu -------------------------------------------------------

  const picker = $('skins');
  let skins = null;

  function loadSkins() {
    if (skins) return;
    skins = fetch(new URL('../skins/skins.json', import.meta.url))
      .then((reply) => reply.json())
      .then((list) => {
        picker.replaceChildren(...list.map(({ name, label }) => new Option(label, name)));
        // A remembered skin that no longer exists would leave the player bare.
        const wearing = host.getAttribute('skin') ?? 'default';
        if (/^[\w-]+$/.test(wearing) && !list.some((skin) => skin.name === wearing)) host.setAttribute('skin', 'default');
        picker.value = host.getAttribute('skin') ?? 'default';
      })
      .catch(() => $('footer').remove());
  }

  picker.addEventListener('change', () => host.setAttribute('skin', picker.value));

  fill($('volume'));
  fill($('seek'));
  draw();

  return {
    draw,
    skin(name) {
      picker.value = name;
    },
  };
}

function clock(seconds) {
  const whole = Math.floor(seconds || 0);
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, '0')}`;
}

// Lets a skin paint the played part of a slider: --fill runs 0% to 100%.
function fill(slider) {
  const span = slider.max - slider.min || 1;
  slider.style.setProperty('--fill', `${((slider.value - slider.min) / span) * 100}%`);
}
