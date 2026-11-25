# Movie Booking – 3D seat preview

- `site/`: the booking website (three.js). It previews the view from each seat in 3D. See [site/README.md](site/README.md).
- `cinema/`: Blender source for the theater (`cinema_theater.blend`), the exported GLB, seat data and renders.

Run locally:

```
python -m http.server 5173 --directory site
```
