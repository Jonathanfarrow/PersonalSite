# PersonalSite

A countryside house you can look around, cut open like a doll's house: a **studio** in the loft for the music, an **office** on the first floor for work and writing, and a **games room** on the ground floor. Static site, no build step.

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

- `tools/blender/` — the house is modelled and lit in Blender, by script:
  - `build_cutaway.py` builds the whole scene (house, rooms, garden, church). Add `-- --render out.png` for a still.
  - `bake_export.py` bakes the lighting and writes `src/assets/models/house.glb`, `scene.json` and `sky.jpg`. Compress the model afterwards with `npx @gltf-transform/cli meshopt house.glb house.glb`.
  - `build_props.py` builds the furniture models (`props.glb`) the scene uses.
- `src/js/world/house.js` — loads the baked model and adds what moves or can be clicked (records, cabinets, live screens, smoke, firelight). Positions here mirror the Blender script.
- `src/js/world/World.js` — camera, effects and clicks. `src/js/ui/Panel.js` — the side panel.
- `src/vendor/` — three.js and marked, checked in so the site works on GitHub Pages without a build.

The number of records on the wall (six) and arcade cabinets (three) is fixed in the model; the first tracks and games in `content/site.json` are attached to them.

Add `?quality=high` or `?quality=lite` to the URL to pin the effects level; otherwise it adapts to the device.
