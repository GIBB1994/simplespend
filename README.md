# App Template

## Create a new app repo
1) Click "Use this template" on GitHub
2) Name repo: app-<something> (example: app-flashcards)
3) Create repo

## Customize the new app
- index.html: update <title> and header text
- manifest.json: update name + short_name
- sw.js: update CACHE_NAME to match repo + version (example: app-flashcards-v1)
- VERSION.txt: set v1

## Deploy
Settings → Pages → Deploy from branch → main / root

## Release rule (avoid caching issues)
Every release:
- bump VERSION.txt (v2, v3...)
- bump CACHE_NAME in sw.js to match (app-xyz-v2, app-xyz-v3...)

