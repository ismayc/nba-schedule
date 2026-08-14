# Regenerating the social share image (`public/og-image.png`, 1200×630)

```bash
python3 scripts/make-og-image.py   # from the repo root; needs Pillow
```

The card is drawn programmatically (dark brand background, the emoji-basketball
mark per the family icon recipe, the season in the accent red, nine team logos
from `public/logos/`, and the view pills). It regenerates byte-stable output —
update the season string in the script at each rollover and re-run.

This deviates from the NFL sibling's author-HTML-and-screenshot recipe on
purpose: a screenshot depends on the browser's window size and per-site zoom
(both fought back hard on 2026-08-13), while Pillow renders the exact 1200×630
deterministically.
