#!/bin/zsh
# снимок симулятора в горизонтали: simshot.sh <имя>
D=63CB386F-F616-4148-9AB4-90EF26FA79C8
xcrun simctl io $D screenshot /tmp/_sim.png >/dev/null 2>&1 && sips -r 270 /tmp/_sim.png --out /tmp/_simr.png >/dev/null && sips -Z 1400 /tmp/_simr.png --out "$1.png" >/dev/null && echo "$1.png"
