// The player's markup, as it goes inside <wav-player>'s shadow root.
// ui.js finds these elements by id. Skins style the classes; the embedding
// page styles the parts, as wav-player::part(title). Both sets of names are
// listed in the README and are safe to rely on.

export const markup = /* html */ `
<main class="player" part="player" data-state="idle">
  <header class="player__now" part="now">
    <div class="player__title" part="title" id="title"></div>
    <div class="player__detail" part="detail" id="detail"></div>
  </header>

  <div class="player__seek" part="seek">
    <span class="player__time" part="time elapsed" id="elapsed">0:00</span>
    <input type="range" part="slider seek-slider" id="seek" min="0" max="1" step="0.01" value="0" aria-label="Seek" disabled>
    <span class="player__time" part="time duration" id="duration">0:00</span>
  </div>

  <div class="player__controls" part="controls">
    <button type="button" class="btn" part="button prev" id="prev" aria-label="Previous track">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h2v14H6zM20 5v14L9 12z"/></svg>
    </button>
    <button type="button" class="btn btn--main" part="button toggle" id="toggle" aria-label="Play">
      <svg class="icon-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l13-8z"/></svg>
      <svg class="icon-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>
    </button>
    <button type="button" class="btn" part="button next" id="next" aria-label="Next track">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 5h2v14h-2zM4 5v14l11-7z"/></svg>
    </button>
    <label class="player__volume" part="volume">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9zM16 8a5 5 0 0 1 0 8z"/></svg>
      <input type="range" part="slider volume-slider" id="volume" min="0" max="1" step="0.01" value="1" aria-label="Volume">
    </label>
  </div>

  <form class="player__add" part="add" id="add" hidden>
    <input type="text" part="field" id="source" placeholder="s3://bucket/take.wav or https://…" aria-label="Track address" autocomplete="off" spellcheck="false">
    <button type="submit" class="btn btn--text" part="button text-button">Add</button>
    <label class="btn btn--text" part="button text-button">
      Open files
      <input type="file" id="files" accept=".wav,audio/wav,audio/x-wav" multiple hidden>
    </label>
  </form>

  <ol class="player__list" part="list" id="list"></ol>
  <p class="player__empty" part="empty" id="empty" hidden>Drop WAV files here.</p>

  <footer class="player__footer" part="footer" id="footer" hidden>
    <label>Skin <select id="skins"></select></label>
  </footer>
</main>
`;
