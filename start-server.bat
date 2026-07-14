@echo off
cd /d "%~dp0"
echo Starting server at http://localhost:8080/
echo Press Ctrl+C to stop.
py -m http.server 8080
