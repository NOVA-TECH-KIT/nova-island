@echo off
setlocal
where cl >nul 2>nul
if errorlevel 1 (
  for /f "usebackq tokens=*" %%i in (`"%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do call "%%i\VC\Auxiliary\Build\vcvars64.bat" >nul
)
where cl >nul 2>nul
if errorlevel 1 (
  echo Install Visual Studio C++ Build Tools or run from an x64 Native Tools prompt.
  exit /b 1
)
cl /nologo /LD /O2 /W3 "%~dp0glass-capture.c" /Fo"%~dp0glass-capture.obj" /link user32.lib /OUT:"%~dp0glass-capture.node" /IMPLIB:"%~dp0glass-capture.lib"
exit /b %errorlevel%
