# Audio

The supplied recording is the **only** sound in this book. No speech synthesis,
no generated tones, no page-turn swish, no ambient bed.

## How the clips were derived

The boundaries come from the reader marking each page ending **by ear** in
`tools/sync.html`, which plays the source recording, shows each page's text in
turn, and records a timestamp per tap. Each tap is snapped to the midpoint of
the nearest pause ffmpeg detected, so a slightly early or late tap still lands
on a clean cut.

The 11 marks were 9.160, 19.605, 24.350, 31.715, 38.080, 42.520, 53.760,
62.940, 74.040, 80.540 and 86.795 seconds.

`tools/analyse-audio.ps1` remains for reference: it estimates the split from
syllable counts and pause positions. Its estimate was close but audibly wrong,
which is what the ear pass corrected — pause length alone cannot find page
breaks in this recording, because the pauses run continuously from 0.93s down
to 0.63s with no separation between sentence breaks and page breaks.

## The clips

`tools/cut-audio.ps1` cuts them; `assets/audio/page-02.mp3` … `page-13.mp3`,
about 697 KB total. Page 1 is the cover, has no words, and has no clip.

`tools/verify-audio.ps1` checks the result objectively — every clip starts and
ends on speech (0.00 s of dead air at both ends on all 12), and reports the
pacing: **mean 0.226 s per syllable, spread 0.033**.

### Correcting a page

Edit its `@(start, end)` pair in `tools/cut-audio.ps1` and re-run:

```powershell
powershell -ExecutionPolicy Bypass -File tools\cut-audio.ps1
powershell -ExecutionPolicy Bypass -File tools\verify-audio.ps1
```

The filenames never change, so `PageAudio` appends `?v=` (the `CUT` constant in
`script.js`) to every clip URL. **Bump it after re-cutting**, or a refresh will
quietly keep playing the previous audio.

## Playback

`PageAudio` in `script.js` owns all of it:

- **One `HTMLAudioElement`, deliberately not attached to the document.** An
  `<audio>` added to the DOM here never gets past `readyState 0`; detached is
  the only form that loads. `data-clip` on `<html>` exposes which clip is live
  so the element is still observable.
- **Never call `load()` before `play()`.** An explicit `load()` immediately
  followed by `play()` wedges the element at `readyState 0` and no media events
  ever fire. Assigning `src` already starts the load.
- Every entry point calls `stop()` first — pause and rewind.
- A **token counter** invalidates any `play()` promise still in flight, so
  hammering next/prev cannot leave a stale clip running.
- The clip is chosen **by page number**, so page N can only play page N's words.

### Controls

| Control | Does |
| --- | --- |
| **पढ़कर सुनाओ / Read aloud** | narration on/off; on by default, remembered as `aaru.read` |
| **Speaker button** | mutes without changing the transport, remembered as `aaru.sound` |

The recording is Hindi, so switching to English disables read-aloud rather than
playing Hindi under English text.

### Autoplay

Browsers block audio until the reader interacts; turning a page *is* an
interaction, so narration starts from page 2 onward. If you embed the book in
an **iframe**, add `allow="autoplay"` or the clips will silently never start.

## Known limits

**Page 12 runs fast** — 0.149 s per syllable against 0.19-0.27 everywhere else,
i.e. 40 syllables in 5.94 s. If any page still sounds off, it is the likeliest.
Moving the page 11 to 12 boundary from 80.540 back to 78.525 (the previous
pause) evens the pacing out, but that contradicts what was heard, so the marked
timing stands. Worth one listen.
