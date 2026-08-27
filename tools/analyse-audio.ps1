# ---------------------------------------------------------------------------
#  Works out which part of the recording belongs to which page — from evidence
#  rather than assumption.
#
#  1. ffmpeg reports where the reader actually paused, giving the real list of
#     spoken utterances with exact start/end times.
#  2. Each page's Hindi text is reduced to a syllable estimate, which tracks
#     speech duration far better than a character count does.
#  3. A dynamic program splits the ordered utterances into 12 consecutive
#     groups, minimising the mismatch between each group's measured duration
#     and the duration its syllables predict. Consecutive-only grouping means
#     the story order can never be scrambled.
#
#  It prints the fit for two readings of the opening — whether the first short
#  utterance is the title or the start of page 2 — so the better fit decides.
# ---------------------------------------------------------------------------
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$src  = Join-Path $root 'Aaru ki cheenkh.mp3'

# ── 1. where the reader paused ────────────────────────────────────────────
$tmp = Join-Path $env:TEMP "aaru-silence.txt"
# ffmpeg reports on stderr, which PowerShell 5.1 turns into an error record,
# so route it through cmd and read it back from a file
& cmd /c "ffmpeg -hide_banner -nostats -i `"$src`" -af silencedetect=noise=-38dB:d=0.28 -f null - 2> `"$tmp`""
$raw = Get-Content $tmp
$dur = [double](& ffprobe -v error -show_entries format=duration -of csv=p=0 $src)

$gaps = @()
$pending = $null
foreach ($line in $raw) {
  if ($line -match 'silence_start:\s*([\d.]+)') { $pending = [double]$Matches[1] }
  elseif ($line -match 'silence_end:\s*([\d.]+)' -and $null -ne $pending) {
    $gaps += ,@($pending, [double]$Matches[1]); $pending = $null
  }
}

# utterances = the audio between the gaps
$utt = @(); $cursor = 0.0
foreach ($g in $gaps) {
  if ($g[0] -gt $cursor + 0.05) { $utt += ,@($cursor, $g[0]) }
  $cursor = $g[1]
}
if ($dur -gt $cursor + 0.05) { $utt += ,@($cursor, $dur) }

"$($utt.Count) spoken utterances in $([math]::Round($dur,2))s"
""
"  #   start     end     len"
for ($i = 0; $i -lt $utt.Count; $i++) {
  "{0,3}  {1,6:N2}  {2,6:N2}  {3,6:N2}" -f $i, $utt[$i][0], $utt[$i][1], ($utt[$i][1] - $utt[$i][0])
}

# ── 2. syllables per page ─────────────────────────────────────────────────
$js = Get-Content (Join-Path $root 'script.js') -Raw -Encoding UTF8
$pages = @()
foreach ($m in [regex]::Matches($js, 'text:\s*\{\s*\r?\n\s*hi:\s*"((?:[^"\\]|\\.)*)"')) {
  $pages += ($m.Groups[1].Value -replace '<[^>]+>','' -replace '&[a-z]+;',"'")
}

function Syllables([string]$s) {
  $n = 0
  for ($i = 0; $i -lt $s.Length; $i++) {
    $c = [int][char]$s[$i]
    if ($c -ge 0x0905 -and $c -le 0x0914) { $n++ }                  # independent vowel
    elseif ($c -ge 0x0915 -and $c -le 0x0939) {                     # consonant
      $next = if ($i + 1 -lt $s.Length) { [int][char]$s[$i+1] } else { 0 }
      if ($next -ne 0x094D) { $n++ }                                # unless halant-joined
    }
  }
  return $n
}
$syl = $pages | ForEach-Object { Syllables $_ }
""
"syllables per page (2..13): $($syl -join ', ')   total $(($syl | Measure-Object -Sum).Sum)"

# ── 3. split the utterances into 12 consecutive groups ────────────────────
function BestSplit($utts, $weights) {
  $N = $utts.Count; $P = $weights.Count
  $totalSpeech = 0.0
  foreach ($u in $utts) { $totalSpeech += ($u[1] - $u[0]) }
  $totalW = ($weights | Measure-Object -Sum).Sum

  # prefix sums of spoken time
  $pre = [double[]]::new($N + 1)
  for ($i = 0; $i -lt $N; $i++) { $pre[$i+1] = $pre[$i] + ($utts[$i][1] - $utts[$i][0]) }

  $INF = [double]::MaxValue / 4
  # jagged, not [,] — PowerShell reads $a[$p,$n] on a 2-D array as an index
  # list rather than a row/column pair
  $cost = @(); $from = @()
  for ($p = 0; $p -le $P; $p++) {
    $row = [double[]]::new($N + 1)
    for ($n = 0; $n -le $N; $n++) { $row[$n] = $INF }
    $cost += ,$row
    $from += ,([int[]]::new($N + 1))
  }
  $cost[0][0] = 0

  for ($p = 1; $p -le $P; $p++) {
    $want = $totalSpeech * $weights[$p-1] / $totalW
    for ($n = $p; $n -le $N - ($P - $p); $n++) {
      for ($k = $p - 1; $k -lt $n; $k++) {
        if ($cost[$p-1][$k] -ge $INF) { continue }
        $got = $pre[$n] - $pre[$k]
        $d = $got - $want
        $c = $cost[$p-1][$k] + $d * $d
        if ($c -lt $cost[$p][$n]) { $cost[$p][$n] = $c; $from[$p][$n] = $k }
      }
    }
  }
  # walk back
  $cuts = [int[]]::new($P + 1); $cuts[$P] = $N
  for ($p = $P; $p -ge 1; $p--) { $cuts[$p-1] = $from[$p][$cuts[$p]] }
  return @{ cuts = $cuts; cost = $cost[$P][$N] }
}

foreach ($skip in 0, 1) {
  $sub = if ($skip) { $utt[1..($utt.Count-1)] } else { $utt }
  $r = BestSplit $sub $syl
  $rms = [math]::Sqrt($r.cost / 12)
  ""
  "=== opening treated as: $(if($skip){'a title, page 2 starts at utterance 1'}else{'page 2, starting at 0.00s'}) ==="
  "    fit RMS error: $([math]::Round($rms,3))s per page  (lower is better)"
  "  page  utt      start     end     len   syll   s/syll"
  for ($p = 0; $p -lt 12; $p++) {
    $a = $r.cuts[$p]; $b = $r.cuts[$p+1] - 1
    $s = $sub[$a][0]; $e = $sub[$b][1]
    $len = $e - $s
    "  {0,4}  {1,2}-{2,-2}  {3,7:N2} {4,7:N2} {5,6:N2}  {6,5}  {7,6:N3}" -f ($p+2), $a, $b, $s, $e, $len, $syl[$p], ($len / $syl[$p])
  }
}
