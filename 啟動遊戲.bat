@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (
  echo 第一次執行，正在安裝套件...
  call npm ci
)
start "" http://localhost:3090
node server.js
