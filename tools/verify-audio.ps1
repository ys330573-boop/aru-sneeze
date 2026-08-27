# ---------------------------------------------------------------------------
#  Checks every page clip objectively:
#    · does it start on speech (no dead air at the front)?
#    · does it end on speech (no dead air at the back)?
#    · does its length match the syllables of that page's text?
#  Nothing here relies on listening — it measures the files that ship.
# ---------------------------------------------------------------------------
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dir  = Join-Path $root 'assets\audio'
$tmp  = Join-Path $env:TEMP 'aaru-verify.txt'

$js = Get-Content (Join-Path $root 'script.js') -Raw -Encoding UTF8
$pages = @()
foreach ($m in [regex]::Matches($js, 'text:\s*\{\s*\r?\n\s*hi:\s*"((?:[^"\\]|\\.)*)"')) {
  $pages += ($m.Groups[1].Value -replace '<[^>]+>','' -replace '&[a-z]+;',"'")
}
function Syllables([string]$s) {
  $n = 0
  for ($i = 0; $i -lt $s.Length; $i++) {
    $c = [int][char]$s[$i]
    if ($c -ge 0x0905 -and $c -le 0x0914) { $n++ }
    elseif ($c -ge 0x0915 -and $c -le 0x0939) {
      $next = if ($i + 1 -lt $s.Length) { [int][char]$s[$i+1] } else { 0 }
      if ($next -ne 0x094D) { $n++ }
    }
  }
  return $n
}

$LEAD_MAX = 0.20   # seconds of silence tolerated at either end
$rates = @(); $fails = 0
"page   file        len    syll  sec/syll   lead    tail   verdict"
for ($p = 2; $p -le 13; $p++) {
  $f = Join-Path $dir ("page-{0:d2}.mp3" -f $p)
  if (-not (Test-Path $f)) { "  $p   MISSING"; $fails++; continue }

  $dur = [double](& ffprobe -v error -show_entries format=duration -of csv=p=0 $f)
  & cmd /c "ffmpeg -hide_banner -nostats -i `"$f`" -af silencedetect=noise=-38dB:d=0.12 -f null - 2> `"$tmp`""
  $raw = Get-Content $tmp

  $starts = @(); $ends = @()
  foreach ($line in $raw) {
    if ($line -match 'silence_start:\s*([-\d.]+)') { $starts += [double]$Matches[1] }
    if ($line -match 'silence_end:\s*([\d.]+)')    { $ends   += [double]$Matches[1] }
  }
  # silence at the very front = a silence_end with no earlier silence_start
  $lead = 0.0
  if ($ends.Count -gt 0 -and ($starts.Count -eq 0 -or $ends[0] -le $starts[0])) { $lead = $ends[0] }
  # silence at the very back = a trailing silence_start with no matching end
  $tail = 0.0
  if ($starts.Count -gt $ends.Count) { $tail = $dur - $starts[$starts.Count-1] }
  elseif ($starts.Count -gt 0 -and $ends.Count -gt 0 -and $starts[$starts.Count-1] -gt $ends[$ends.Count-1]) {
    $tail = $dur - $starts[$starts.Count-1]
  }

  $syl  = Syllables $pages[$p-2]
  $rate = $dur / $syl
  $rates += $rate
  $ok = ($lead -le $LEAD_MAX) -and ($tail -le $LEAD_MAX)
  if (-not $ok) { $fails++ }
  "{0,4}   page-{0:d2}   {1,6:N2}  {2,5}   {3,6:N3}  {4,5:N2}  {5,6:N2}   {6}" -f `
     $p, $dur, $syl, $rate, $lead, $tail, $(if ($ok) { "ok" } else { "TRIMMED POORLY" })
}
$m = ($rates | Measure-Object -Average).Average
$sd = [Math]::Sqrt((($rates | ForEach-Object { ($_ - $m) * ($_ - $m) }) | Measure-Object -Sum).Sum / $rates.Count)
""
"pacing across pages: mean {0:N3} s/syllable, spread {1:N3}" -f $m, $sd
"slowest {0:N3}  fastest {1:N3}" -f ($rates | Measure-Object -Maximum).Maximum, ($rates | Measure-Object -Minimum).Minimum
""
if ($fails) { "RESULT: $fails page(s) need attention" } else { "RESULT: all 12 clips start and end on speech" }
