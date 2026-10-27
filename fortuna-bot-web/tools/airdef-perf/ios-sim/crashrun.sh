#!/bin/zsh
# прогон страницы в симуляторе: crashrun.sh <адрес> <секунд> — сколько раз упал графический процесс Safari
D=63CB386F-F616-4148-9AB4-90EF26FA79C8; H=$(cd "$(dirname "$0")" && pwd); L=${TMPDIR:-/tmp}/airdef-gl.log
: > $L; b=$(ls ~/Library/Logs/DiagnosticReports | grep -c 'WebKit.GPU'); bw=$(ls ~/Library/Logs/DiagnosticReports | grep -c 'WebContent')
xcrun simctl terminate $D com.apple.mobilesafari 2>/dev/null; sleep 1
xcrun simctl openurl $D "$1"; sleep $2
a=$(ls ~/Library/Logs/DiagnosticReports | grep -c 'WebKit.GPU'); aw=$(ls ~/Library/Logs/DiagnosticReports | grep -c 'WebContent')
echo "$1: GPU-сбоев $((a-b)), WebContent-сбоев $((aw-bw)), перезапусков страницы $(grep -c '^.* start' $L), вызовов $(grep -c '#' $L)"
