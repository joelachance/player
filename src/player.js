// The player: a playlist over one <audio> element. It knows nothing about
// the page, so any markup or skin can drive it.
//
// A track is { title, detail, url }, where url() returns (or resolves to)
// something the audio element can load. It is called each time the track
// starts, so short-lived addresses such as presigned S3 links stay fresh.
//
// Events: "tracks" (list changed), "track" (current track changed),
// "state" (playing / paused / loading / idle), "time", "error".

export class Player extends EventTarget {
  constructor(audio = new Audio()) {
    super();
    this.audio = audio;
    this.tracks = [];
    this.index = -1;
    this.state = 'idle';
    this.error = null;
    this.starting = 0;

    audio.preload = 'metadata';
    audio.addEventListener('playing', () => this.#state('playing'));
    audio.addEventListener('pause', () => {
      if (this.state === 'playing') this.#state('paused');
    });
    audio.addEventListener('waiting', () => this.#state('loading'));
    audio.addEventListener('timeupdate', () => this.#emit('time'));
    audio.addEventListener('durationchange', () => this.#emit('time'));
    audio.addEventListener('ended', () => {
      if (this.index < this.tracks.length - 1) this.next();
      else this.#state('paused');
    });
    audio.addEventListener('error', () => {
      if (audio.getAttribute('src')) this.#fail(describe(audio.error));
    });
  }

  get current() {
    return this.tracks[this.index] ?? null;
  }

  get time() {
    return this.audio.currentTime || 0;
  }

  get duration() {
    return Number.isFinite(this.audio.duration) ? this.audio.duration : 0;
  }

  get volume() {
    return this.audio.volume;
  }

  set volume(level) {
    this.audio.volume = Math.min(1, Math.max(0, level));
  }

  add(...tracks) {
    this.tracks.push(...tracks);
    this.#emit('tracks');
  }

  remove(index) {
    if (index < 0 || index >= this.tracks.length) return;
    this.tracks.splice(index, 1);
    if (index === this.index) {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
      this.index = -1;
      this.starting += 1;
      this.#state('idle');
      this.#emit('track');
    } else if (index < this.index) {
      this.index -= 1;
    }
    this.#emit('tracks');
  }

  async play(index = this.index) {
    const track = this.tracks[index];
    if (!track) return;
    const attempt = ++this.starting;
    this.index = index;
    this.error = null;
    this.#emit('track');
    this.#state('loading');
    try {
      const url = await track.url();
      if (attempt !== this.starting) return; // another track was chosen meanwhile
      this.audio.src = url;
      await this.audio.play();
    } catch (cause) {
      if (attempt !== this.starting || cause?.name === 'AbortError') return;
      // The browser's own wording for an unreadable source is opaque; ours says what to check.
      this.#fail(cause?.name === 'NotSupportedError' ? describe({ code: 4 }) : cause?.message || 'Could not play this track');
    }
  }

  toggle() {
    if (this.index < 0) return this.play(0);
    if (this.error) return this.play();
    if (this.audio.paused) return this.audio.play().catch(() => {});
    this.audio.pause();
  }

  next() {
    if (this.index < this.tracks.length - 1) return this.play(this.index + 1);
  }

  prev() {
    // Like most players: go back to the start first, then to the track before.
    if (this.time > 3 || this.index <= 0) return this.seek(0);
    return this.play(this.index - 1);
  }

  seek(seconds) {
    if (this.duration) this.audio.currentTime = Math.min(this.duration, Math.max(0, seconds));
  }

  #fail(message) {
    this.error = message;
    this.#state('paused');
    this.#emit('error');
  }

  #state(state) {
    if (this.state === state) return;
    this.state = state;
    this.#emit('state');
  }

  #emit(name) {
    this.dispatchEvent(new Event(name));
  }
}

function describe(error) {
  switch (error?.code) {
    case 2: return 'Network error while loading the track';
    case 3: return 'This file could not be decoded';
    case 4: return 'Track not found, not permitted, or not a format this browser plays';
    default: return 'Could not play this track';
  }
}
