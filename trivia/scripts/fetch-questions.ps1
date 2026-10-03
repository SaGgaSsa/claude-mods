<#
.SYNOPSIS
  Adds multiple-choice questions from Open Trivia DB to trivia/questions.json.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File trivia/scripts/fetch-questions.ps1
  powershell -ExecutionPolicy Bypass -File trivia/scripts/fetch-questions.ps1 -Batches 4
  powershell -ExecutionPolicy Bypass -File trivia/scripts/fetch-questions.ps1 -Category 9 -Difficulty hard

.NOTES
  The API returns at most 50 questions a request and allows one request every 5 seconds per IP.
  Questions already in the file (same text) are skipped. Category ids: https://opentdb.com/api_category.php
#>
param(
  [ValidateRange(1, 50)] [int] $Amount = 50,
  [ValidateRange(1, 100)] [int] $Batches = 1,
  [int] $Category = 0,
  [ValidateSet('', 'easy', 'medium', 'hard')] [string] $Difficulty = '',
  [string] $Path = (Join-Path $PSScriptRoot '..\questions.json')
)

$ErrorActionPreference = 'Stop'
$api = 'https://opentdb.com'

# url3986 keeps the response ASCII, so Windows PowerShell can't garble accented text.
function Decode([string] $value) {
  [System.Net.WebUtility]::HtmlDecode([Uri]::UnescapeDataString($value))
}

function Key([string] $question) {
  ([System.Net.WebUtility]::HtmlDecode($question)).Trim().ToLowerInvariant()
}

$Path = [IO.Path]::GetFullPath($Path)
if (Test-Path $Path) {
  $bank = [IO.File]::ReadAllText($Path) | ConvertFrom-Json
  $results = [System.Collections.ArrayList]@($bank.results)
} else {
  $results = [System.Collections.ArrayList]@()
}
$seen = @{}
foreach ($entry in $results) { $seen[(Key $entry.question)] = $true }
$before = $results.Count

# A session token keeps the API from sending the same question twice across batches.
$token = (Invoke-RestMethod "$api/api_token.php?command=request").token

$query = "amount=$Amount&type=multiple&encode=url3986&token=$token"
if ($Category -gt 0) { $query += "&category=$Category" }
if ($Difficulty) { $query += "&difficulty=$Difficulty" }

for ($batch = 1; $batch -le $Batches; $batch++) {
  if ($batch -gt 1) { Start-Sleep -Seconds 6 }
  $response = Invoke-RestMethod "$api/api.php?$query"

  if ($response.response_code -eq 4) {
    Write-Host 'No more questions for these filters.'
    break
  }
  if ($response.response_code -eq 1) {
    Write-Host "The API doesn't have $Amount questions for these filters; try a smaller -Amount."
    break
  }
  if ($response.response_code -ne 0) {
    Write-Warning "API answered response_code $($response.response_code); stopping."
    break
  }

  $added = 0
  foreach ($item in $response.results) {
    $question = Decode $item.question
    $key = Key $question
    if ($seen[$key]) { continue }
    $seen[$key] = $true
    [void] $results.Add([ordered]@{
      type = 'multiple'
      difficulty = Decode $item.difficulty
      category = Decode $item.category
      question = $question
      correct_answer = Decode $item.correct_answer
      incorrect_answers = @($item.incorrect_answers | ForEach-Object { Decode $_ })
    })
    $added++
  }
  Write-Host "Batch ${batch}: $added new of $($response.results.Count)."
}

$json = [ordered]@{ response_code = 0; results = $results.ToArray() } | ConvertTo-Json -Depth 5
# UTF-8 without BOM: the mod parses the file with JSON.parse.
[IO.File]::WriteAllText($Path, $json, (New-Object System.Text.UTF8Encoding $false))

Write-Host "$($results.Count - $before) questions added; $($results.Count) in $Path."
Write-Host 'Restart Claude Code or run /reload-plugins to load them.'
