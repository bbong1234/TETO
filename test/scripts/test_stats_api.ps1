$response = Invoke-WebRequest -Uri "http://localhost:3000/api/stats" -Method GET -UseBasicParsing
$content = $response.Content
$content | Out-File -FilePath "stats_response.json" -Encoding UTF8
Write-Host "API response saved to stats_response.json"

# Check if the file contains average fields
if ($content -like '*zhou ping jun*') {
    Write-Host 'Contains average fields'
} else {
    Write-Host 'Does not contain average fields'
}

# Show the first 1000 characters to verify structure
Write-Host "\nFirst 1000 characters of response:"
$content.Substring(0, [Math]::Min(1000, $content.Length))
