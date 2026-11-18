# HexSec

A personal Windows music player with an artwork-colored blurred background, a focused full-window player, and online and local music playback.

## Download

Get **HexSec-Windows-compact.zip** from [Releases](https://github.com/Sharu-Sk-HexSec/HexSec/releases/latest), extract the **complete** folder, then open **HexSec.exe**. Keep the resources and runtime files beside the executable.

## Features

- Online song search and playback through the built-in Echo-compatible music source.
- Tamil, Anirudh, A. R. Rahman and English collections, plus feeling-based collection searches behind the Album songs toggle.
- Album artwork backgrounds, dark/light appearance, a full-window player, lyrics, quality selection, queue, favourites and local playlists.
- Next skips recognized duplicate/alternate song versions. Previous follows the actual playback order, including shuffle and collection changes.
- Optional song radio/autoplay. Local audio including FLAC.
- Optional Google collection connection and an optional LibreTranslate server for lyric translation.

Feeling collections use music catalogue searches; they are not an AI recommendation engine. HexSec Ai/Gemini has been removed.

## Development

Windows x64 and Node.js 24 or newer are recommended.

```powershell
npm ci
npm start
npm test
```

The committed `app/provider.cjs` is the bundled source adapter. To rebuild it:

```powershell
npm ci --prefix app/provider-source --omit=dev --ignore-scripts
npm run build:provider
```

Build the Windows portable ZIP, including the Python Google-library helper:

```powershell
npm ci --prefix app/provider-source --omit=dev --ignore-scripts
npm run build:windows
```

The build downloads the pinned Python runtime and Python dependencies over HTTPS and verifies Python wheel SHA-256 hashes against PyPI metadata. Output is `dist/HexSec-Windows.zip`. Google-library sync needs that packaged Python helper; it is not installed by `npm start` alone.

## Accounts and limitations

Online availability and playback quality depend on the music source. Online audio is compressed; FLAC support is for local files. Search-based feeling collections are not guaranteed mood classifications or official charts. Duplicate filtering uses catalogue IDs, title normalization and version labels; unlabelled covers/remakes can be missed.

Google login requires your own **Desktop app** OAuth client JSON and the YouTube Data API enabled in your project. Import the client inside the app; never commit it. Upstream YouTube Music OAuth limitations mean the official fallback supports owned playlists and liked YouTube videos rather than the complete saved-album library. YouTube items require a user-selected matching audio version when the video cannot play embedded.

For compatibility, local settings and encrypted account data remain under `%APPDATA%/Aural`. Windows credential encryption protects saved account credentials. Credentials, personal music, listening history and OAuth client files are not included in this repository or release.

## Credits and license

MIT; see [LICENSE](LICENSE). The source adapter derives from [EchoMusicApp/320kbs-extension](https://github.com/EchoMusicApp/320kbs-extension), with its original copyright/license retained in `app/provider-source/LICENSE` and `app/ECHO-EXTENSION-LICENSE.txt`. HexSec modifies its entry exports and suggestion metadata handling. Electron, Chromium, Python and Python dependencies retain their own bundled license notices. This independent player is not affiliated with Echo, YouTube, Google or JioSaavn.
