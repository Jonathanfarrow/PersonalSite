# PersonalSite

A Victorian terrace you can look around, cut open like a doll's house: a **studio** in the loft for the music, an **office** on the first floor for work and writing, and a **games room** on the ground floor. Static site, no build step.

## Run it

```
npm run dev
```

Then open http://localhost:3000.

## Change what's in the rooms

Everything shown in the panels comes from [`content/site.json`](content/site.json):

- `studio.tracks` — each track is a record on the studio wall (first six; empty slots are filled with plain records). `spotify` is a Spotify track id and shows Spotify's player, `audio` is a path to a file in `content/music/`, `url` links out, `cover` replaces the generated sleeve.
- `office.projects` — the Work tab. Writing is read from `content/essays` and `content/technical` as before (add the file, then list it in that folder's `index.json`).
- `games.games` — each game is an arcade cabinet (first four). `image` shows in the panel and on the cabinet screen; `playUrl` adds a Play button.
- `about` — bio, photo and links.

## Where things live

- `src/js/world/` — the 3D scene (three.js). One file per room, `building.js` for the shell and street, `World.js` for camera and clicks.
- `src/js/ui/Panel.js` — the side panel.
- `src/assets/models/props.glb` — furniture and props modelled in Blender. Rebuild with `blender -b --python tools/blender/build_props.py`.
- `src/vendor/` — three.js and marked, checked in so the site works on GitHub Pages without a build.

Add `?quality=high` or `?quality=lite` to the URL to pin the effects level; otherwise it adapts to the device.
