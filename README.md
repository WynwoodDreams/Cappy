# Capy Club

Landing page for Pilates, Please and Capy Takes a Napy, with interactive coloring samples and Pilates merchandise.

Run `python3 -m http.server 8000` and open `http://localhost:8000` to preview locally.

All artwork, fonts, coloring region maps and the studio sales sheet are included. Prices are planned retail and online checkout is not live yet.

## Adding links before launch

Everything that points off the site lives in the `SITE` block at the top of `app.js`. Anything left empty stays hidden.

| Setting         | What it does                                                                                 |
| --------------- | -------------------------------------------------------------------------------------------- |
| `amazonPilates` | Shows a "Buy on Amazon" button next to Pilates, Please                                        |
| `amazonNaps`    | Same for Capy Takes a Napy once it is released                                                |
| `instagram`     | Adds an Instagram link to the footer                                                          |
| `email`         | Adds an "Email us" footer link; the studio inquiry and "Notify me" forms open a pre-filled email |
| `formEndpoint`  | Optional form service URL (Formspree, Basin, etc.); when set, both forms post there instead of opening email |

Until `email` or `formEndpoint` is set, both forms validate input and show a "preview" confirmation without sending anything.

Before publishing, also change `og:image` in `index.html` to a full `https://` URL so link previews show the cover.
