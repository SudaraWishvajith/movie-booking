# Starlight Cinema – seat booking demo

A static site: movie listings, showtimes, and a 3D seat picker. When you pick a seat, the camera flies into that seat's view of the screen.

## Run locally

The 3D model is loaded with `fetch`, so the page has to be served over http. Opening `index.html` directly as a file won't load the model.

```powershell
python -m http.server 5173 --directory site
```

Then open http://localhost:5173

## Files

| Path | What it is |
| --- | --- |
| `index.html` | Page layout (hero, Now Showing, booking, about) |
| `css/styles.css` | Styles. Colors are variables at the top |
| `js/theater3d.js` | three.js viewer: loads the GLB, colors seats by status, flies the camera, handles clicking seats in 3D |
| `js/main.js` | Movies, showtimes, prices, the 2D seat map, the booking flow |
| `assets/cinema_theater.glb` | Theater model exported from Blender (`../cinema/cinema_theater.blend`) |
| `assets/seats.json` | Each seat's eye position and the point its view faces, in three.js coordinates |

## Hooking up a real backend

All the demo data is in `js/main.js`:
- `MOVIES`, `TIMES`, `PRICES`: replace with data from your API.
- `refreshShow()`: makes up the taken seats from a seeded random generator. Replace this with your API's list of booked seats for the showtime.
- The checkout dialog's `close` handler saves bookings to `localStorage`. Replace that with a POST to your booking endpoint.

Seat IDs: the 3D node names (`Seat_A01` … `Seat_L22`) are the keys used everywhere. The labels people see are `A1` … `L22`.

## Updating the model

Edit `cinema/cinema_theater.blend`. Re-export it as GLB with "Apply Modifiers" and "Custom Properties" on, leave out the FX collection, lights and cameras, then copy the GLB into `site/assets/`. If seats move, regenerate `seats.json` too.
