<#
.SYNOPSIS
  Builds trivia/questions.json from The Trivia API: varied categories, universal and not niche.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File trivia/scripts/fetch-trivia-api.ps1
  powershell -ExecutionPolicy Bypass -File trivia/scripts/fetch-trivia-api.ps1 -PerCategory 50

.NOTES
  Replaces the whole bank. Each category gets the same share, split 35% easy, 40% medium and
  25% hard. Questions tied to a region or marked niche are dropped, and so are US and UK local
  ones the API leaves untagged (states, presidents, NFL...). The total is capped at 1000.
  Questions from https://the-trivia-api.com, licensed CC BY-NC 4.0.
#>
param(
  [ValidateRange(1, 100)] [int] $PerCategory = 100,
  [string] $Path = (Join-Path $PSScriptRoot '..\questions.json')
)

$ErrorActionPreference = 'Stop'
$api = 'https://the-trivia-api.com/v2/questions'
$limit = 1000
$maxTries = 6

# API slug => category name written to the bank.
$categories = [ordered]@{
  general_knowledge = 'General Knowledge'
  geography = 'Geography'
  history = 'History'
  science = 'Science'
  sport_and_leisure = 'Sport & Leisure'
  music = 'Music'
  film_and_tv = 'Film & TV'
  arts_and_literature = 'Arts & Literature'
  society_and_culture = 'Society & Culture'
  food_and_drink = 'Food & Drink'
}
$shares = [ordered]@{ easy = 0.35; medium = 0.40; hard = 0.25 }

if ($categories.Count * $PerCategory -gt $limit) {
  $PerCategory = [Math]::Floor($limit / $categories.Count)
}

function Get-Questions([string] $category, [string] $difficulty) {
  $url = "${api}?limit=50&categories=$category&difficulties=$difficulty"
  $response = Invoke-WebRequest -Uri $url -UseBasicParsing
  # Decode as UTF-8 ourselves: Windows PowerShell may guess another encoding.
  $text = [System.Text.Encoding]::UTF8.GetString($response.RawContentStream.ToArray())
  # Windows PowerShell hands a JSON array over as one object; unroll it.
  return @($text | ConvertFrom-Json | ForEach-Object { $_ })
}

# US and UK trivia the API still counts as universal: states, presidents, local leagues and TV.
$localPattern = '(?i)\b(US|U\.S\.|USA|American|United States|UK|U\.K\.|British) ' +
  '(state|states|president|presidents|city|county|TV|television|sitcom|football)\b' +
  "|\b(US|American) state's\b|\bpresident of the (USA|United States|US)\b" +
  '|\b(NFL|NBA|MLB|BBC|Congress)\b'

function Test-Usable($item) {
  $item.type -eq 'text_choice' -and
    -not $item.isNiche -and
    @($item.regions).Count -eq 0 -and
    @($item.incorrectAnswers).Count -eq 3 -and
    $item.question.text -and
    $item.question.text -notmatch $localPattern
}

$results = New-Object System.Collections.ArrayList
$seenIds = @{}
$seenText = @{}

foreach ($slug in $categories.Keys) {
  $counts = @()
  $planned = 0
  foreach ($difficulty in $shares.Keys) {
    # The last share takes the rounding remainder, so each category adds up to PerCategory.
    $want = if ($difficulty -eq 'hard') {
      $PerCategory - $planned
    } else {
      [int] [Math]::Round($PerCategory * $shares[$difficulty])
    }
    $planned += $want
    $got = 0
    $stale = 0

    for ($try = 1; $try -le $maxTries -and $got -lt $want -and $stale -lt 2; $try++) {
      Start-Sleep -Milliseconds 400
      $added = 0
      foreach ($item in Get-Questions $slug $difficulty) {
        if ($got -ge $want) { break }
        if (-not (Test-Usable $item)) { continue }
        $key = $item.question.text.Trim().ToLowerInvariant()
        if ($seenIds[$item.id] -or $seenText[$key]) { continue }
        $seenIds[$item.id] = $true
        $seenText[$key] = $true
        [void] $results.Add([ordered]@{
          type = 'multiple'
          difficulty = $difficulty
          category = $categories[$slug]
          question = $item.question.text.Trim()
          correct_answer = $item.correctAnswer.Trim()
          incorrect_answers = @($item.incorrectAnswers | ForEach-Object { $_.Trim() })
        })
        $got++
        $added++
      }
      if ($added -eq 0) { $stale++ } else { $stale = 0 }
    }

    $counts += $got
    if ($got -lt $want) {
      Write-Warning "$($categories[$slug]) / ${difficulty}: only $got of $want."
    }
  }
  Write-Host ("{0,-18} easy {1,3}  medium {2,3}  hard {3,3}" -f $categories[$slug], $counts[0], $counts[1], $counts[2])
}

$json = [ordered]@{ response_code = 0; results = $results.ToArray() } | ConvertTo-Json -Depth 5
# UTF-8 without BOM: the mod parses the file with JSON.parse.
[IO.File]::WriteAllText([IO.Path]::GetFullPath($Path), $json, (New-Object System.Text.UTF8Encoding $false))

Write-Host "$($results.Count) questions written to $Path."
Write-Host 'Restart Claude Code or run /reload-plugins to load them.'
