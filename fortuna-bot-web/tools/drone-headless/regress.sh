#!/bin/sh
# Сверка одиночной игры с эталоном: 6 сценариев, контрольные суммы боя (hash) должны совпасть с baseline.txt.
# Любой рефакторинг логики боя (games/drone/sim, main.js), который не должен менять поведение, — прогонять до и после.
#   tools/drone-headless/regress.sh            — сравнить с baseline.txt (около минуты)
#   tools/drone-headless/regress.sh --update   — записать новый эталон (только если поведение меняли НАМЕРЕННО)
# Работает через Deno (Linux/облако и macOS); run.sh (JavaScriptCore) даёт те же суммы.
cd "$(dirname "$0")"
TMP=$(mktemp)
for a in "medium arcade day" "medium arcade day god" "high real rain god" "low training day" "cinema arcade sunset god" "ultra real overcast"; do
  echo "== $a" | tee -a "$TMP"
  # ограничение 240 с на прогон (perl alarm — есть и в macOS, и в Linux); stdin закрыт, чтобы Deno ничего не ждал
  perl -e 'alarm 240; exec @ARGV' deno run --allow-read --allow-write --allow-net --allow-env run-deno.js $a < /dev/null 2>&1 \
    | grep -E "fly 120|training 150|FAIL|LOAD|error" | sed 's/→ {"hash":\(-*[0-9]*\).*/hash \1/' | tee -a "$TMP"
done
if [ "$1" = "--update" ]; then mv "$TMP" baseline.txt; echo "эталон обновлён"; exit 0; fi
if diff baseline.txt "$TMP" > /dev/null; then echo "СОВПАДАЕТ с эталоном (6 сценариев)"; rm -f "$TMP"; else echo "РАСХОЖДЕНИЕ с эталоном:"; diff baseline.txt "$TMP"; rm -f "$TMP"; exit 1; fi
