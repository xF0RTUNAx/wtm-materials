#!/bin/zsh
# A/B вылетов: ab.sh <доп. параметры игры> <прогонов> — сколько раз страница перезагружалась (сбой) за 60 с
D=63CB386F-F616-4148-9AB4-90EF26FA79C8; H=$(cd "$(dirname "$0")" && pwd); L=${TMPDIR:-/tmp}/airdef-gl.log
for i in $(seq 1 $2); do
  : > $L; xcrun simctl terminate $D com.apple.mobilesafari 2>/dev/null; sleep 1
  xcrun simctl openurl $D "http://localhost:8937/fortuna-bot-web/tools/airdef-ui/gl-log.html?go=air&nowrap=1&x=$1&r=$RANDOM"; sleep 60
  s=$(grep -c ' start ' $L); hb=$(grep -c ' hb' $L); echo "[$1] прогон $i: загрузок страницы $s (1 — без сбоя), пульс $hb"
done
