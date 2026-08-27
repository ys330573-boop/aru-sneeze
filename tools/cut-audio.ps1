# ---------------------------------------------------------------------------
#  Cuts the single narration recording into one clip per story page.
#
#  Source: "Aaru ki cheenkh.mp3" in the project root (a 24 kHz mono WAV despite
#  the extension, 93.36 s). Output: assets/audio/page-02.mp3 … page-13.mp3.
#
#  The boundaries below are NOT guesses. tools/analyse-audio.ps1 measures where
#  the reader actually paused, estimates each page's syllable count, and runs a
#  dynamic program that splits the utterances into 12 consecutive groups with
#  the best duration fit. Every boundary therefore falls inside a real pause,
#  so no clip can begin or end mid-word, and the silence between pages is
#  dropped rather than shipped inside a clip.
#
#  TO CORRECT A PAGE: edit its @(start, end) pair and re-run:
#      powershell -ExecutionPolicy Bypass -File tools\cut-audio.ps1
# ---------------------------------------------------------------------------
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$src  = Join-Path $root 'Aaru ki cheenkh.mp3'
$dest = Join-Path $root 'assets\audio'

# Start and end of each page's narration, in seconds.
#
# These come from the reader marking each page ending by ear in tools/sync.html
# — not from any estimate. The 11 marks were 9.160, 19.605, 24.350, 31.715,
# 38.080, 42.520, 53.760, 62.940, 74.040, 80.540 and 86.795, every one landing
# on the midpoint of a pause ffmpeg had detected.
#
# Each clip is then pulled in to the speech either side of its pause: 80 ms
# before the first word and 150 ms after the last, so a page starts speaking
# the moment it appears and never clips a syllable. The one exception is the
# 31.61–31.82 pause, only 0.21 s wide, where pages 5 and 6 simply meet.
$CLIPS = @(
  @( 0.190,  8.990),   # page  2
  @( 9.400, 19.290),   # page  3
  @(19.990, 24.070),   # page  4
  @(24.700, 31.720),   # page  5
  @(31.720, 37.800),   # page  6
  @(38.430, 42.400),   # page  7
  @(42.710, 53.610),   # page  8
  @(53.980, 62.690),   # page  9
  @(63.260, 73.840),   # page 10
  @(74.310, 80.290),   # page 11
  @(80.860, 86.800),   # page 12
  @(86.860, 93.210)    # page 13
)

if (-not (Test-Path $src))  { throw "Recording not found: $src" }
if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Path $dest | Out-Null }

$total = 0
for ($i = 0; $i -lt $CLIPS.Count; $i++) {
  $page  = $i + 2
  $start = $CLIPS[$i][0]
  $len   = $CLIPS[$i][1] - $start
  $out   = Join-Path $dest ("page-{0:d2}.mp3" -f $page)

  # 12 ms fades so the cut points cannot click
  & ffmpeg -hide_banner -loglevel error -y `
      -ss $start -t $len -i $src `
      -af "afade=t=in:st=0:d=0.012,afade=t=out:st=$([Math]::Round($len-0.012,3)):d=0.012" `
      -ac 1 -ar 24000 -c:a libmp3lame -b:a 64k $out
  if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed on page $page" }

  $kb = [Math]::Round((Get-Item $out).Length / 1KB)
  $total += $kb
  "page-{0:d2}.mp3   {1,6:N2}s → {2,6:N2}s   ({3,5:N2}s)   {4,4} KB" -f $page, $start, $CLIPS[$i][1], $len, $kb
}
""
"12 clips, $total KB total"
