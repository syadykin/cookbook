"""Makes the static, subset TTFs embedded for the PDF export.

The PDF library cannot use variable fonts and does no shaping, so each weight is pinned and
layout tables are dropped; the subset keeps Latin, Cyrillic and common punctuation, which cuts
the binary by about 1 MB. Sources are the variable fonts from github.com/google/fonts (OFL):

    python3 subset.py 'Inter[opsz,wght].ttf' Inter-Regular.ttf wght=400,opsz=14
    python3 subset.py 'Inter[opsz,wght].ttf' Inter-Medium.ttf wght=500,opsz=14
    python3 subset.py 'Caveat[wght].ttf' Caveat-SemiBold.ttf wght=600
"""

import sys

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

src, out, axes = sys.argv[1], sys.argv[2], dict(kv.split('=') for kv in sys.argv[3].split(','))
f = TTFont(src)
f = instantiateVariableFont(f, {k: float(v) for k, v in axes.items()}, updateFontNames=False)
opts = subset.Options()
opts.hinting = False
opts.layout_features = []
opts.drop_tables += ['GSUB', 'GPOS', 'GDEF', 'STAT', 'DSIG']
opts.name_IDs = ['*']
s = subset.Subsetter(opts)
s.populate(
    unicodes=list(range(0x20, 0x7F))
    + list(range(0xA0, 0x180))  # Latin-1, Latin Extended-A
    + list(range(0x400, 0x530))  # Cyrillic + Supplement
    + list(range(0x2000, 0x2070))  # general punctuation: dashes, quotes, ellipsis
    + list(range(0x2150, 0x2160))  # vulgar fractions
    + [0x2116, 0x2122, 0x2212, 0x2248, 0x2264, 0x2265]  # № ™ − ≈ ≤ ≥
)
s.subset(f)
f.save(out)
