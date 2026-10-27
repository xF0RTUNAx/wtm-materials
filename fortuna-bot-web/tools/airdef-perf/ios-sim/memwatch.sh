#!/bin/zsh
# память процессов Safari симулятора (WebContent, GPU) раз в 2 с: memwatch.sh <секунд>
for i in $(seq 1 $(( $1 / 2 ))); do
  t=$(date +%H:%M:%S); line="$t"
  for p in $(ps -axo pid,command | grep "iOS 26.5.simruntime" | grep -E "WebContentExtension|GPUExtension" | grep -v grep | awk '{print $1}'); do
    n=$(ps -o command= -p $p | grep -q GPUExtension && echo GPU || echo WC); fp=$(footprint -p $p 2>/dev/null | grep -m1 "Footprint:" | sed 's/.*Footprint: //; s/ (.*//')
    line="$line  $n:$fp"
  done
  echo "$line"; sleep 2
done
