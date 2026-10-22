$ErrorActionPreference = 'Stop'
$verifyName = 'englishdrive-chat-learning-' + [guid]::NewGuid().ToString('N').Substring(0, 10)
$previousDatabase = $env:DATABASE_URL
$previousChatDatabase = $env:CHAT_TEST_DATABASE_URL
$started = $false
try {
  docker run -d --name $verifyName -e POSTGRES_PASSWORD=local-chat-test-only -e POSTGRES_DB=chat_test -p 127.0.0.1::5432 postgres:17-alpine
  if ($LASTEXITCODE -ne 0) { throw 'Cannot start isolated test database' }
  $started = $true
  for ($attempt = 0; $attempt -lt 25; $attempt++) {
    docker exec $verifyName pg_isready -U postgres -d chat_test *> $null
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 1
  }
  if ($LASTEXITCODE -ne 0) { throw 'Test database not ready' }
  $binding = docker port $verifyName 5432/tcp
  $verifyPort = ($binding -split ':')[-1].Trim()
  $env:DATABASE_URL = "postgresql://postgres:local-chat-test-only@127.0.0.1:$verifyPort/chat_test"
  $env:CHAT_TEST_DATABASE_URL = $env:DATABASE_URL
  pnpm --filter '@english-drive/api' exec prisma migrate deploy
  if ($LASTEXITCODE -ne 0) { throw 'Test migration failed' }
  pnpm --filter '@english-drive/api' test --maxWorkers=1
  if ($LASTEXITCODE -ne 0) { throw 'Backend tests failed' }
} finally {
  $env:DATABASE_URL = $previousDatabase
  $env:CHAT_TEST_DATABASE_URL = $previousChatDatabase
  if ($started) { docker rm -f $verifyName }
}
