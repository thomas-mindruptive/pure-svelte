@echo off
wt ^
new-tab -p "Dev" --title "svelte check" cmd /k "cd /d \dev\pure\pure-svelte && npm run check:watch" ; ^
new-tab -p "Dev" --title "watch  lib" cmd /k "cd /d \dev\pure\pure-svelte && npm run watch:lib" ; ^
new-tab -p "Dev" --title "dev" cmd /k "cd /d \dev\pure\pure-svelte && npm run dev" ; ^
new-tab -p "Dev" --title "tools watch" cmd /k "cd /d \dev\pure\pure-svelte && npm run tools:watch" ; ^
new-tab -p "Dev" --title "shopify watch" cmd /k "cd /d \dev\pure\pure-shopify && npm run watch" ; ^
new-tab -p "Dev" --title "pure-svelte" cmd /k "cd /d \dev\pure\pure-svelte"


echo: NOTE: Add following to win termin profiles.json:
(
  echo             {
  echo                 "name": "Dev",
  echo                 "guid": "{2c8f4918-62d3-41a6-9a25-8370216694e1}",
  echo                 "commandline": "%%SystemRoot%%\\System32\\cmd.exe",
  echo                 "suppressApplicationTitle": true,
  echo                 "hidden": false,
  echo                 "font": 
  echo                 {
  echo                     "size": 11
  echo                 },
  echo                 "colorScheme": "Tango Light",
  echo                 "historySize": 12000
  echo             }
)

pause