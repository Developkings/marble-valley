# Marble Valley

A tilt-controlled marble time attack for Android, built with TypeScript, Three.js and Capacitor.

## Setup

```bash
npm install
```

```bash
npm run dev
```

## Music

Music files are not stored in this repository, so a fresh copy of the game has sound effects but no music until you add some. There are two ways to add it.

### On the phone, in the game

1. Open **Settings** from the main menu.
2. Tap **Use your own music** and choose an audio file from your phone. MP3 is the safest choice; other formats depend on what your phone can play.
3. The song starts straight away, loops during play, and is remembered the next time you open the game.

To undo it, tap **Back to default music** in the same place. The game keeps its own copy of the song, so you can delete or move the original afterwards. It stays on your phone and is never uploaded or shared.

### In the project, as the default music

1. Save an MP3 as `public/music/adagio-for-strings-kinda.mp3`, the file the Valley skin looks for. To use another name, change `music` for that skin in `src/themes.ts`.
2. Restart the dev server, or rebuild the app, and tap anywhere in the game to start the music.
3. If it isn't the track already listed, update `MUSIC_CREDITS` in `src/credits.ts` so the Attribution page credits the right author and licence.

Everything in `public/music/` is ignored by git, so it won't be uploaded to GitHub.

The default track is [Adagio For Strings [kinda]](https://ende.app/en/song/13253-adagio-for-strings-kinda) by Sascha Ende (CC BY 4.0, [ende.app standard license](https://ende.app/standard-license)). Download it from that page and save it under the name above.

Only ship music you have the right to use. Check the licence of any track you add, and credit it if the licence asks you to. A file added on the phone is for your own use.
