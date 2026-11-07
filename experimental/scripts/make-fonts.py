"""Cuts the static font files the app bundles from the web's variable fonts.

React Native on Android can't set variable-font axes, so each weight/axis combination the brand uses becomes its own file:
Fraunces at SOFT 100 (the web's soft, rounded headings) and Geist at the web's exact weights, including the claim weights.

Usage (from experimental/), with fontTools importable (it lives on D: here):
  set PYTHONPATH=D:\\dev-cache\\pylib && python scripts/make-fonts.py D:\\dev-cache\\fonts
The folder needs Fraunces.ttf (Fraunces[SOFT,WONK,opsz,wght]) and Geist.ttf (Geist[wght]) from github.com/google/fonts.
"""

import sys
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

src = Path(sys.argv[1])
out = Path(__file__).resolve().parent.parent / "assets" / "fonts"
out.mkdir(parents=True, exist_ok=True)

# name -> (source file, axis values). opsz follows the size each cut is used at (optical sizing, like the web's "auto").
CUTS = {
    "Fraunces-300": ("Fraunces.ttf", {"wght": 300, "opsz": 36, "SOFT": 100, "WONK": 0}),
    "Fraunces-400": ("Fraunces.ttf", {"wght": 400, "opsz": 28, "SOFT": 100, "WONK": 0}),
    "Fraunces-500": ("Fraunces.ttf", {"wght": 500, "opsz": 20, "SOFT": 100, "WONK": 0}),
    **{f"Geist-{w}": ("Geist.ttf", {"wght": w}) for w in (200, 330, 400, 460, 500, 550, 600)},
}

for name, (file, axes) in CUTS.items():
    font = TTFont(src / file)
    supported = {a.axisTag for a in font["fvar"].axes}
    static = instantiateVariableFont(font, {k: v for k, v in axes.items() if k in supported}, updateFontNames=False)
    # Each file is its own family on Android, named as the app refers to it.
    for rec in static["name"].names:
        if rec.nameID in (1, 4, 6, 16):
            rec.string = name
        elif rec.nameID in (2, 17):
            rec.string = "Regular"
    static.save(out / f"{name}.ttf")
    print(f"{name}.ttf  {(out / f'{name}.ttf').stat().st_size // 1024} KB")
