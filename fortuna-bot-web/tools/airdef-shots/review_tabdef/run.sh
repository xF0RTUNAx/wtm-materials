#!/bin/zsh
# run.sh - ждёт, пока на Маке нет других безголовых страниц (главный чат тоже снимает), и запускает shots.js: ./run.sh <сценарии> <phone|pc|both> <метка> [язык]
cd "$(dirname "$0")"
while ps aux | grep -E "Google Chrome.*headless|chrome-headless|puppeteer" | grep -v grep | grep -v "run.sh" | grep -v "puppeteer_dev_chrome_profile-H99m0A" | grep -q .; do sleep 6; done
deno run -A shots.js "$@"
