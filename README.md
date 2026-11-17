# Player

A small WAV player for the browser. It plays files from your disk and from
S3, its whole look lives in one swappable CSS file, and it embeds in any web
page with one tag. No dependencies and no build step; Node 20 or newer runs
the local server.

```sh
node server.js                      # http://localhost:4173
node server.js --dir ~/Music/takes  # also lists the WAVs in that folder
node server.js --port 8080
node --test                         # tests
```

## Playing things

| Source | How |
| --- | --- |
| Files on disk | **Open files**, or drop them on the page |
| A folder on disk | Start the server with `--dir`; its WAVs (one level of subfolders deep) fill the playlist |
| S3 | Type `s3://bucket/path/take.wav` and press **Add** |
| Any web address | Type `https://…/take.wav` and press **Add** |

Space plays and pauses. Previous goes back to the start of the track first,
then to the track before.

### S3

For an `s3://` address the page asks the local server for a presigned
address, good for an hour, and plays that. A fresh one is signed every time
the track starts, so a playlist left open overnight still works. Your keys
stay in the server process and never reach the browser.

The server finds credentials the way the AWS tools do:

1. `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (and `AWS_SESSION_TOKEN`) in the environment, or else
2. whatever the AWS CLI resolves (`AWS_PROFILE`, SSO, and so on), through
   `aws configure export-credentials`.

The bucket's region is looked up for you; `AWS_REGION` is the fallback. The
credentials need `s3:GetObject` on the object.

With no credentials, the object is tried as a public one at
`https://bucket.s3.amazonaws.com/key`.

The server listens on `127.0.0.1` only and answers only to `localhost`,
because it will sign for anything your credentials can read.

## Embedding

The player is a custom element, `<wav-player>`. Put this folder on any
static host and add two lines to a page:

```html
<script type="module" src="https://your.host/player/src/element.js"></script>
<wav-player src="https://your.host/takes/kick.wav" skin="midnight"></wav-player>
```

It lives in a shadow root, so the page's CSS cannot restyle it and its CSS
cannot leak into the page. Size and place the element like any block. Several
players can share a page; starting one pauses the others.

For more than one track, put links inside. They double as the fallback when
scripts are off:

```html
<wav-player skin="cassette">
  <a href="takes/kick.wav">Kick</a>
  <a href="s3://my-bucket/takes/snare.wav">Snare</a>
</wav-player>
```

| Attribute | Meaning |
| --- | --- |
| `src` | One track: an http(s) address, relative to the page if you like, or `s3://bucket/key` |
| `skin` | A skin's name from `skins/`, or the address of your own skin sheet |
| `editable` | The listener may add and remove tracks: address box, file picker, drop |
| `skin-menu` | Show the skin menu |
| `signer` | Address of an endpoint that presigns `s3://` addresses |
| `folder` | Address of a JSON list of WAVs to load (the server's `/api/local`) |
| `page` | The player is the whole page: it fills it and remembers the skin |

`src`, `skin`, `editable` and `skin-menu` can change at any time. From
script, `element.player` is the `Player` (its events, `play()`, `seek()`
and so on) and `element.add(address or File, title)` appends a track.
Nothing plays until the listener presses play.

Where only an iframe is allowed, use `embed.html`:

```html
<iframe src="https://your.host/player/embed.html?src=https%3A%2F%2Fyour.host%2Ftakes%2Fkick.wav&skin=midnight"
        style="border:0; width:100%; max-width:460px; height:230px"></iframe>
```

`src` and `title` may repeat, one pair per track; `skin` is a skin's name;
`editable` lets the listener add tracks. A frame does not grow with its
contents, so allow about 60px of height for each track after the first.

Things to know when hosting it:

- The script is a module, so a page on another site can load it only if your
  host sends `Access-Control-Allow-Origin` for the files in `src/` and
  `skins/`. GitHub Pages, Netlify, Cloudflare Pages and jsDelivr do; on S3 or
  your own server, switch it on. The iframe needs no such header.
- Audio itself plays across sites without any header.
- On the public web there is no local server to sign S3 addresses, so an
  `s3://` track is fetched as a public object. For private audio, either give
  the player presigned `https://` addresses, or run an endpoint of your own
  that answers `GET <signer>?uri=s3://…` with `{ "url": "…" }` and name it in
  `signer`. `lib/presign.js` does the signing. `server.js` is not that
  endpoint: it is built to be reached from your own machine only.

## Skins

`skins/base.css` is layout and nothing else. Every colour, font, radius and
shadow is a custom property that a skin sets on `:host`. To make one:

1. Copy `skins/default.css` to `skins/yours.css`. It lists every property:
   ten required ones, and the optional ones with their fallbacks.
2. Change the values. Add rules of your own below them if properties are not
   enough; `skins/cassette.css` does.
3. Add `{ "name": "yours", "label": "Yours" }` to `skins/skins.json`.

It then shows in the Skin menu and works as `skin="yours"`. The standalone
page remembers the choice, and `http://localhost:4173/?skin=yours` opens
with it. A skin need not live in this folder: `skin="https://…/mine.css"`
loads any sheet written the same way.

Hooks a skin can style on:

- `.player[data-state]` is `idle`, `loading`, `playing` or `paused`.
- `.player--error` is set while a track has failed; `.player--drop` while
  files are dragged over the player.
- `.track[aria-current="true"]` is the current track in the list.
- Sliders carry `--fill`, from `0%` to `100%`, for the played part.
- Icons are inline SVG filled with `currentColor`.

To go further than CSS, change `src/markup.js`: `src/ui.js` finds elements
by id, and `src/player.js` knows nothing about the page, so it can drive
markup of your own.

## Layout

```
index.html        the standalone app: one <wav-player> with everything on
embed.html        the player for an iframe, set up from the query string
src/element.js    <wav-player>, the custom element
src/markup.js     the markup inside it
src/ui.js         wires that markup to a Player
src/player.js     Player: a playlist over one <audio> element, with events
src/sources.js    turns files, folder entries and addresses into tracks
src/s3.js         s3:// parsing, shared by the page and the server
skins/            base.css, one file per skin, skins.json
server.js         static files, --dir folder, /api/presign
lib/presign.js    Signature Version 4 presigning, credentials, bucket region
test/             node --test
```

## Limits

- WAV only in the pickers, since that is what this is for; the browser
  decides which WAV encodings it can decode (16- and 24-bit PCM and 32-bit
  float are fine in current browsers).
- A whole S3 bucket or prefix cannot be listed yet; add objects one address
  at a time.
