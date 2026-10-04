#!/bin/zsh
# Gera sons/troca-recebida.mp3 e sons/troca-concluida.mp3: sininho + voz neural.
# Uso: tools/gerar-sons.sh [voz] [pasta-saida]
#   voz: uma das vozes do edge-tts (padrao en-US-AvaNeural). Lista:
#        "$TTS" --list-voices | grep en-US
# Precisa: ffmpeg (brew) e o edge-tts no venv do perfil de teste:
#   python3 -m venv ~/Library/Application\ Support/RoLivre-teste/venv
#   ~/Library/Application\ Support/RoLivre-teste/venv/bin/pip install edge-tts
set -e
VOZ=${1:-en-US-AvaNeural}
SAIDA=${2:-"$(dirname $0)/../sons"}
TTS="$HOME/Library/Application Support/RoLivre-teste/venv/bin/edge-tts"
T=$(mktemp -d)
nota() { # freq dur saida
  local st=$(awk -v d="$2" 'BEGIN{printf "%.3f", d-0.08}')
  ffmpeg -loglevel error -y -f lavfi -i "sine=frequency=$1:duration=$2" \
    -af "afade=t=in:d=0.01,afade=t=out:st=$st:d=0.08,volume=0.35" -ar 44100 -ac 1 "$3"
}
# recebida: E6 A6 subindo; concluida: arpejo de do maior ate C7
nota 1318.5 0.14 $T/r1.wav; nota 1760 0.22 $T/r2.wav
nota 1046.5 0.11 $T/c1.wav; nota 1318.5 0.11 $T/c2.wav; nota 1568 0.11 $T/c3.wav; nota 2093 0.26 $T/c4.wav
ffmpeg -loglevel error -y -f lavfi -i anullsrc=r=44100:cl=mono -t 0.12 $T/pausa.wav
voz() { # texto saida
  "$TTS" --voice "$VOZ" --text "$1" --write-media $T/v.mp3 >/dev/null
  # corta o silencio do comeco/fim que o TTS deixa
  ffmpeg -loglevel error -y -i $T/v.mp3 -af "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse" -ar 44100 -ac 1 "$2"
}
voz "Trade received!" $T/vr.wav
voz "Trade completed!" $T/vc.wav
junta() { # saida arquivos...
  local out=$1; shift
  printf "file '%s'\n" "$@" > $T/lista.txt
  ffmpeg -loglevel error -y -f concat -safe 0 -i $T/lista.txt -af "loudnorm=I=-16:TP=-1.5" -ar 44100 -ac 1 -b:a 96k "$out"
}
mkdir -p "$SAIDA"
junta "$SAIDA/troca-recebida.mp3" $T/r1.wav $T/r2.wav $T/pausa.wav $T/vr.wav
junta "$SAIDA/troca-concluida.mp3" $T/c1.wav $T/c2.wav $T/c3.wav $T/c4.wav $T/pausa.wav $T/vc.wav
rm -rf $T
echo "ok: $VOZ -> $SAIDA"
