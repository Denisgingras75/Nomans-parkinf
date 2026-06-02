#!/usr/bin/env python3
"""Render MANAGER_GUIDE.md -> MANAGER_GUIDE.pdf.

The printable manager guide is generated from the markdown so the two never
drift. Run this whenever MANAGER_GUIDE.md changes:

    python3 -m venv /tmp/pdfvenv
    /tmp/pdfvenv/bin/pip install xhtml2pdf markdown
    /tmp/pdfvenv/bin/python scripts/build-guide-pdf.py

Uses xhtml2pdf (same engine the original PDF was produced with).
"""
import os

import markdown
from xhtml2pdf import pisa

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "MANAGER_GUIDE.md")
OUT = os.path.join(ROOT, "MANAGER_GUIDE.pdf")

CSS = """
@page { size: letter; margin: 1.6cm 1.6cm; }
body { font-family: Helvetica, Arial, sans-serif; font-size: 10.5pt;
       color: #1b1b1b; line-height: 1.4; }
h1 { font-size: 20pt; color: #b22222; margin: 0 0 6pt 0; }
h2 { font-size: 14pt; color: #111; margin: 16pt 0 4pt 0;
     border-bottom: 1px solid #ddd; padding-bottom: 2pt; }
h3 { font-size: 12pt; color: #b22222; margin: 12pt 0 3pt 0; }
p  { margin: 4pt 0; }
ul, ol { margin: 4pt 0 4pt 0; }
li { margin: 2pt 0; }
strong { color: #000; }
a { color: #1155cc; text-decoration: underline; }
hr { border: none; border-top: 1px solid #ccc; margin: 10pt 0; }
code { font-family: Courier, monospace; background: #f3f3f3; font-size: 9.5pt; }
table { -pdf-keep-with-next: false; width: 100%; border-collapse: collapse;
        margin: 6pt 0; }
th { background: #b22222; color: #fff; text-align: left; padding: 4pt 6pt;
     font-size: 9.5pt; }
td { border-bottom: 1px solid #e2e2e2; padding: 4pt 6pt; font-size: 9.5pt;
     vertical-align: top; }
blockquote { color: #555; border-left: 3px solid #b22222; margin: 6pt 0;
             padding: 2pt 0 2pt 10pt; }
"""


def main() -> None:
    with open(SRC, "r", encoding="utf-8") as fh:
        md = fh.read()
    body = markdown.markdown(md, extensions=["tables", "sane_lists"])
    html = f"<html><head><meta charset='utf-8'><style>{CSS}</style></head><body>{body}</body></html>"
    with open(OUT, "w+b") as out:
        result = pisa.CreatePDF(html, dest=out, encoding="utf-8")
    if result.err:
        raise SystemExit(f"PDF generation failed with {result.err} error(s)")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
