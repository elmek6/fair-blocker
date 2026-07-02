@echo off
REM fair-block dogrulama scripti
REM Kullanilan Node: PATH'teki C:\Code\nodejs (.tooling silindi)
setlocal

cd /d "%~dp0"

echo === Node surumu ===
where node
node --version
echo.

if not exist "node_modules" (
  echo node_modules yok, bagimliliklar kuruluyor...
  call npm install
  if errorlevel 1 goto :fail
)

echo === Typecheck ===
call npm run typecheck
if errorlevel 1 goto :fail

echo === Testler ===
call npm test
if errorlevel 1 goto :fail

echo.
echo === TUMU BASARILI ===
exit /b 0

:fail
echo.
echo === HATA: dogrulama basarisiz ===
exit /b 1
