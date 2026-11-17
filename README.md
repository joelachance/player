# Player

A small WAV player for the browser. It plays files from your disk and from
S3, and its whole look lives in one swappable CSS file. No dependencies and
no build step; Node 20 or newer runs the local server.

```sh
node server.js                      # http://localhost:4173
node server.js --dir ~/Music/takes  # also lists the WAVs in that folder
node server.js --port 8080
node --test                         # tests
```

## Playing things

| Source | How |
| --- | --- |
| Files on disk | **Open files**, or drop them anywhere on the page |
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

## Skins

`skins/base.css` is layout and nothing else. Every colour, font, radius and
shadow is a custom property that a skin supplies. To make one:

1. Copy `skins/default.css` to `skins/yours.css`. It lists every property:
   ten required ones, and the optional ones with their fallbacks.
2. Change the values. Add rules of your own below them if properties are not
   enough; `skins/cassette.css` does.
3. Add `{ "name": "yours", "label": "Yours" }` to `skins/skins.json`.

It then shows in the Skin menu. The choice is remembered, and
`http://localhost:4173/?skin=yours` opens with it.

Hooks a skin can style on:

- `.player[data-state]` is `idle`, `loading`, `playing` or `paused`.
- `.player--error` is set while a track has failed; `.player--drop` while
  files are dragged over the page.
- `.track[aria-current="true"]` is the current track in the list.
- Sliders carry `--fill`, from `0%` to `100%`, for the played part.
- Icons are inline SVG filled with `currentColor`.

To go further than CSS, replace `index.html`: `src/app.js` finds elements by
id and `src/player.js` knows nothing about the page.

## Layout

```
index.html        the markup
src/player.js     Player: a playlist over one <audio> element, with events
src/sources.js    turns files, folder entries and addresses into tracks
src/s3.js         s3:// parsing, shared by the page and the server
src/app.js        wires the page to the Player
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
