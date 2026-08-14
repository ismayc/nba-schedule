#!/usr/bin/env python3
"""Render public/og-image.png (1200x630) for the-nba-schedule, matching
scripts/og-image.html: dark card, basketball mark, title + red season,
tagline, nine team logos, view pills."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math

W, H = 1200, 630
BG = (14, 17, 23)          # --bg #0e1117
GLOW = (42, 26, 32)        # #2a1a20
ACCENT = (226, 59, 78)     # --accent #e23b4e
TEXT = (233, 237, 243)     # #e9edf3
MUTED = (152, 163, 179)    # #98a3b3
PILL_BG = (26, 32, 41)     # #1a2029
PILL_BORDER = (42, 51, 65) # #2a3341
PILL_TEXT = (205, 214, 228)
MARK_BG = (11, 18, 32)     # #0b1220

img = Image.new('RGB', (W, H), BG)

# Radial glow at top-right (radial-gradient(1100px 620px at 82% -14%)).
glow = Image.new('L', (W, H), 0)
gd = ImageDraw.Draw(glow)
cx, cy, rx, ry = int(0.82 * W), int(-0.14 * H), 550, 310
for i in range(60, 0, -1):
    a = int(140 * (1 - i / 60))
    gd.ellipse([cx - rx * i / 60, cy - ry * i / 60, cx + rx * i / 60, cy + ry * i / 60], fill=a)
glow = glow.filter(ImageFilter.GaussianBlur(40))
img = Image.composite(Image.new('RGB', (W, H), GLOW), img, glow)

d = ImageDraw.Draw(img)

def font(size, bold=True):
    # HelveticaNeue.ttc: index 1 = Bold in most macOS builds; fall back scanning.
    for idx in ([1, 8, 0] if bold else [0]):
        try:
            f = ImageFont.truetype('/System/Library/Fonts/HelveticaNeue.ttc', size, index=idx)
            name = f.getname()
            if not bold or 'Bold' in name[1] or idx == 0:
                return f
        except Exception:
            continue
    return ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', size)

PAD = 84
# Mark: rounded square with the emoji basketball — the family's icon language
# (docs/ICONS.md: the sport's ball on the app's dark background).
mx, my, ms = PAD, 74, 96
d.rounded_rectangle([mx, my, mx + ms, my + ms], radius=22, fill=MARK_BG)
try:
    f_ball = ImageFont.truetype('/System/Library/Fonts/Apple Color Emoji.ttc', 64)
    bb = d.textbbox((0, 0), '🏀', font=f_ball, embedded_color=True)
    d.text((mx + (ms - (bb[2] - bb[0])) // 2 - bb[0], my + (ms - (bb[3] - bb[1])) // 2 - bb[1]),
           '🏀', font=f_ball, embedded_color=True)
except Exception:
    bcx, bcy, br = mx + ms // 2, my + ms // 2, 31
    for wdt in range(3):
        d.ellipse([bcx - br - wdt, bcy - br - wdt, bcx + br + wdt, bcy + br + wdt], outline=ACCENT)

# Title.
f_title = font(60)
tx = mx + ms + 26
ty = my + 14
t1 = 'The NBA Schedule '
d.text((tx, ty), t1, font=f_title, fill=TEXT)
w1 = d.textlength(t1, font=f_title)
d.text((tx + w1, ty), '2026-27', font=f_title, fill=ACCENT)

# Tagline.
f_tag = font(30, bold=False)
d.text((PAD, my + ms + 34), 'Every game in your timezone — live scores, standings, the play-in,', font=f_tag, fill=MUTED)
d.text((PAD, my + ms + 74), 'and the playoff bracket.', font=f_tag, fill=MUTED)

# Logos row.
teams = ['bos', 'ny', 'phi', 'mia', 'chi', 'lal', 'gs', 'den', 'okc']
ls, gap = 92, 30
lx, ly = PAD, 330
for t in teams:
    logo = Image.open(f'public/logos/{t}-dark.png').convert('RGBA')
    logo.thumbnail((ls, ls), Image.LANCZOS)
    ox = lx + (ls - logo.width) // 2
    oy = ly + (ls - logo.height) // 2
    img.paste(logo, (ox, oy), logo)
    lx += ls + gap

# Pills.
f_pill = font(20)
px, py = PAD, 490
for label in ['📋 Schedule', '📆 Week', '📊 Regular Season', '🏆 Playoffs', '📈 Stats', '📜 History']:
    # Strip the emoji for measuring/drawing with Helvetica; draw emoji separately.
    emoji, txt = label.split(' ', 1)
    tw = d.textlength(txt, font=f_pill)
    pw = int(tw) + 66
    d.rounded_rectangle([px, py, px + pw, py + 44], radius=11, fill=PILL_BG, outline=PILL_BORDER)
    d.text((px + 44, py + 10), txt, font=f_pill, fill=PILL_TEXT)
    try:
        f_emoji = ImageFont.truetype('/System/Library/Fonts/Apple Color Emoji.ttc', 20)
        d.text((px + 14, py + 10), emoji, font=f_emoji, embedded_color=True)
    except Exception:
        pass
    px += pw + 10

img.save('public/og-image.png', 'PNG')
print('wrote public/og-image.png', img.size)
