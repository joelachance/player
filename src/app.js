// Wires the page to the Player. All looks live in skins/; this file only
// reads ids and sets text, attributes and data-state.

import { Player } from './player.js';
import { fromAddress, fromFile, fromFolder, isWav } from './sources.js';

const $ = (id) => document.getElementById(id);
const root = document.querySelector('.player');
const player = new Player();

// ---- playback ----------------------------------------------------------

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

document.addEventListener('keydown', (event) => {
  if (event.code !== 'Space' || event.target.closest('input, select, button, a')) return;
  event.preventDefault();
  player.toggle();
});

player.addEventListener('state', () => {
  root.dataset.state = player.state;
  $('toggle').setAttribute('aria-label', player.state === 'playing' ? 'Pause' : 'Play');
});

player.addEventListener('track', () => {
  const track = player.current;
  $('title').textContent = track?.title ?? 'Nothing playing';
  $('detail').textContent = track?.detail ?? 'Add a WAV file to start';
  root.classList.remove('player--error');
  drawList();
  drawTime();
});

player.addEventListener('error', () => {
  $('detail').textContent = player.error;
  root.classList.add('player--error');
});

player.addEventListener('time', drawTime);
player.addEventListener('tracks', drawList);

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

function drawList() {
  const list = $('list');
  list.replaceChildren(
    ...player.tracks.map((track, index) => {
      const item = document.createElement('li');
      item.className = 'track';
      if (index === player.index) item.setAttribute('aria-current', 'true');

      const play = document.createElement('button');
      play.type = 'button';
      play.className = 'track__play';
      play.addEventListener('click', () => player.play(index));
      const title = document.createElement('span');
      title.className = 'track__title';
      title.textContent = track.title;
      const detail = document.createElement('span');
      detail.className = 'track__detail';
      detail.textContent = track.detail;
      play.append(title, detail);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'track__remove';
      remove.setAttribute('aria-label', `Remove ${track.title}`);
      remove.textContent = '×';
      remove.addEventListener('click', () => player.remove(index));

      item.append(play, remove);
      return item;
    }),
  );
  $('empty').hidden = player.tracks.length > 0;
}

// ---- adding tracks -----------------------------------------------------

$('add').addEventListener('submit', (event) => {
  event.preventDefault();
  const box = $('source');
  try {
    add([fromAddress(box.value)]);
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

document.addEventListener('dragover', (event) => {
  event.preventDefault();
  root.classList.add('player--drop');
});
document.addEventListener('dragleave', () => root.classList.remove('player--drop'));
document.addEventListener('drop', (event) => {
  event.preventDefault();
  root.classList.remove('player--drop');
  addFiles(event.dataTransfer.files);
});

function addFiles(files) {
  add([...files].filter(isWav).map(fromFile));
}

function add(tracks) {
  if (!tracks.length) return;
  const first = player.tracks.length;
  player.add(...tracks);
  if (player.index < 0) player.play(first);
}

// Tracks from the folder the server was started with, if any. They are
// listed but not started: browsers block sound before the first click.
fetch('/api/local')
  .then((reply) => (reply.ok ? reply.json() : []))
  .then((names) => player.add(...names.map(fromFolder)))
  .catch(() => {});

// ---- skins -------------------------------------------------------------

const link = $('skin');
const picker = $('skins');

function wear(name) {
  link.href = `skins/${name}.css`;
  picker.value = name;
  try {
    localStorage.setItem('skin', name);
  } catch {}
}

fetch('skins/skins.json')
  .then((reply) => reply.json())
  .then((skins) => {
    picker.replaceChildren(...skins.map(({ name, label }) => new Option(label, name)));
    let saved = null;
    try {
      saved = localStorage.getItem('skin');
    } catch {}
    const wanted = new URLSearchParams(location.search).get('skin') ?? saved;
    if (skins.some((skin) => skin.name === wanted)) wear(wanted);
  })
  .catch(() => picker.closest('label').remove());

picker.addEventListener('change', () => wear(picker.value));

// ---- helpers -----------------------------------------------------------

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

fill($('volume'));
fill($('seek'));
drawList();
