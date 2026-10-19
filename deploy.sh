#!/data/data/com.termux/files/usr/bin/bash
cd ~/naira-race
git add -A
git commit -m "${1:-update}"
read -s -p "GitHub token: " T; echo
git push https://rogerrich1234-hub:$T@github.com/rogerrich1234-hub/naira-race.git main
unset T
