# PersonalSite

A three-storey building you can look around: a **studio** for the music, an **office** for work and writing, and a **games room** for games in progress. Static site, no build step.

## Run it

```
npm run dev
```

Then open http://localhost:3000.

## Change what's in the rooms

Everything shown in the panels comes from [`content/site.json`](content/site.json):

- `studio.tracks` — each track is a record on the studio wall (first six). `audio` is a path to a file in `content/music/`, `url` links out, `cover` replaces the generated sleeve.
- `office.projects` — the Work tab. Writing is read from `content/essays` and `content/technical` as before (add the file, then list it in that folder's `index.json`).
- `games.games` — each game is an arcade cabinet (first four). `image` shows in the panel and on the cabinet screen; `playUrl` adds a Play button.
- `about` — bio, photo and links.

## Where things live

- `src/js/world/` — the 3D scene (three.js). One file per room, `building.js` for the shell and street, `World.js` for camera and clicks.
- `src/js/ui/Panel.js` — the side panel.
- `src/vendor/` — three.js and marked, checked in so the site works on GitHub Pages without a build.
