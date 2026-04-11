#!/usr/bin/env python3
"""
Generate a lo-fi UI wireframe sheet (JPEG) from the existing SVG wireframes in docs/figures/.

This creates a grid of screens that looks like a typical wireframe deliverable
(boxes, lines, rough layout), but it's based on your project's real wireframe SVGs.

Note: Rasterizing SVG relies on macOS Quick Look (`qlmanage`).
"""

from __future__ import annotations

import argparse
import os
import subprocess
import tempfile
from dataclasses import dataclass

from AppKit import (
    NSAttributedString,
    NSBezierPath,
    NSBitmapImageRep,
    NSColor,
    NSDeviceRGBColorSpace,
    NSFont,
    NSFontAttributeName,
    NSForegroundColorAttributeName,
    NSGraphicsContext,
    NSJPEGFileType,
    NSMakeRect,
    NSParagraphStyleAttributeName,
    NSStringDrawingUsesLineFragmentOrigin,
)
from Foundation import NSDictionary


@dataclass(frozen=True)
class Rect:
    x: float
    y: float
    w: float
    h: float

    @property
    def x2(self) -> float:
        return self.x + self.w

    @property
    def y2(self) -> float:
        return self.y + self.h


def _nscolor(hex_rgb: str, alpha: float = 1.0) -> NSColor:
    value = hex_rgb.lstrip("#")
    r = int(value[0:2], 16) / 255.0
    g = int(value[2:4], 16) / 255.0
    b = int(value[4:6], 16) / 255.0
    return NSColor.colorWithCalibratedRed_green_blue_alpha_(r, g, b, alpha)


def _font(size: float, bold: bool = False) -> NSFont:
    if bold:
        return NSFont.boldSystemFontOfSize_(size)
    return NSFont.systemFontOfSize_(size)


def _paragraph():
    from AppKit import NSMutableParagraphStyle, NSLeftTextAlignment, NSLineBreakByTruncatingTail

    style = NSMutableParagraphStyle.alloc().init()
    style.setAlignment_(NSLeftTextAlignment)
    style.setLineBreakMode_(NSLineBreakByTruncatingTail)
    return style


def draw_text(text: str, rect: Rect, *, size: float, color: NSColor, bold: bool = False):
    attrs = {
        NSFontAttributeName: _font(size, bold=bold),
        NSForegroundColorAttributeName: color,
        NSParagraphStyleAttributeName: _paragraph(),
    }
    NSAttributedString.alloc().initWithString_attributes_(text, attrs).drawWithRect_options_(  # type: ignore[attr-defined]
        NSMakeRect(rect.x, rect.y, rect.w, rect.h),
        NSStringDrawingUsesLineFragmentOrigin,
    )


def draw_round_rect(rect: Rect, *, radius: float, fill: NSColor, stroke: NSColor, stroke_width: float):
    path = NSBezierPath.bezierPathWithRoundedRect_xRadius_yRadius_(NSMakeRect(rect.x, rect.y, rect.w, rect.h), radius, radius)
    fill.setFill()
    path.fill()
    stroke.setStroke()
    path.setLineWidth_(stroke_width)
    path.stroke()


def ensure_parent_dir(path: str) -> None:
    parent = os.path.dirname(os.path.abspath(path))
    if parent:
        os.makedirs(parent, exist_ok=True)


def ql_rasterize_svg(svg_path: str, *, out_dir: str, size: int) -> str:
    svg_path = os.path.abspath(svg_path)
    os.makedirs(out_dir, exist_ok=True)

    # qlmanage outputs: <basename>.svg.png
    subprocess.run(
        ["qlmanage", "-t", "-s", str(size), "-o", out_dir, svg_path],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    expected = os.path.join(out_dir, os.path.basename(svg_path) + ".png")
    if not os.path.exists(expected):
        # best-effort fallback: find newest png
        pngs = [os.path.join(out_dir, name) for name in os.listdir(out_dir) if name.lower().endswith(".png")]
        pngs.sort(key=lambda p: os.path.getmtime(p), reverse=True)
        if pngs:
            return pngs[0]
        raise FileNotFoundError(f"QuickLook did not produce a PNG for: {svg_path}")
    return expected


def fit_contain(src_w: float, src_h: float, dst: Rect) -> Rect:
    if src_w <= 0 or src_h <= 0:
        return dst
    scale = min(dst.w / src_w, dst.h / src_h)
    w = src_w * scale
    h = src_h * scale
    x = dst.x + (dst.w - w) / 2.0
    y = dst.y + (dst.h - h) / 2.0
    return Rect(x, y, w, h)


def build_sheet(out_path: str, *, thumb_size: int = 1400, quality: float = 0.92) -> None:
    items = [
        ("Login", os.path.join("docs", "figures", "image8-wireframe-login.svg")),
        ("Register", os.path.join("docs", "figures", "image9-wireframe-register.svg")),
        ("Dashboard", os.path.join("docs", "figures", "image10-wireframe-dashboard.svg")),
        ("Voting", os.path.join("docs", "figures", "image11-wireframe-voting.svg")),
        ("Results", os.path.join("docs", "figures", "image12-wireframe-results.svg")),
        ("Admin", os.path.join("docs", "figures", "image13-wireframe-admin.svg")),
    ]

    with tempfile.TemporaryDirectory(prefix="blockvote-wireframes-") as tmp:
        pngs: list[tuple[str, str]] = []
        for label, svg in items:
            if not os.path.exists(svg):
                raise FileNotFoundError(f"Missing wireframe SVG: {svg}")
            pngs.append((label, ql_rasterize_svg(svg, out_dir=tmp, size=thumb_size)))

        # Canvas (2 rows x 3 cols)
        width, height = 3600, 2400
        rep = NSBitmapImageRep.alloc().initWithBitmapDataPlanes_pixelsWide_pixelsHigh_bitsPerSample_samplesPerPixel_hasAlpha_isPlanar_colorSpaceName_bytesPerRow_bitsPerPixel_(
            None,
            width,
            height,
            8,
            4,
            True,
            False,
            NSDeviceRGBColorSpace,
            0,
            0,
        )
        ctx = NSGraphicsContext.graphicsContextWithBitmapImageRep_(rep)
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.setCurrentContext_(ctx)

        bg = _nscolor("#f3f4f6", 1.0)
        ink = _nscolor("#111827", 1.0)
        muted = _nscolor("#4b5563", 1.0)
        card = _nscolor("#ffffff", 1.0)

        bg.setFill()
        NSBezierPath.bezierPathWithRect_(NSMakeRect(0, 0, width, height)).fill()

        draw_text("UI Wireframes (Lo‑Fi)", Rect(90, height - 120, width - 180, 56), size=44, color=ink, bold=True)
        draw_text(
            "Rough page layouts derived from docs/figures wireframe SVGs.",
            Rect(90, height - 172, width - 180, 36),
            size=20,
            color=muted,
        )

        margin_x = 90.0
        margin_y = 110.0
        top_offset = 220.0
        gap_x = 60.0
        gap_y = 70.0
        cols = 3
        rows = 2
        cell_w = (width - margin_x * 2 - gap_x * (cols - 1)) / cols
        cell_h = (height - top_offset - margin_y - gap_y * (rows - 1)) / rows

        # Draw each tile
        from AppKit import NSImage

        for idx, (label, png_path) in enumerate(pngs):
            col = idx % cols
            row = idx // cols
            x = margin_x + col * (cell_w + gap_x)
            # Cocoa origin is bottom-left; place first row at top by computing y from top_offset.
            y_top = height - top_offset - row * (cell_h + gap_y)
            y = y_top - cell_h

            tile = Rect(x, y, cell_w, cell_h)
            draw_round_rect(tile, radius=18.0, fill=card, stroke=ink, stroke_width=2.5)

            header = Rect(tile.x + 18, tile.y2 - 52, tile.w - 36, 34)
            draw_text(label, header, size=22, color=ink, bold=True)

            content = Rect(tile.x + 18, tile.y + 18, tile.w - 36, tile.h - 78)
            img = NSImage.alloc().initWithContentsOfFile_(png_path)
            if img is None:
                raise RuntimeError(f"Failed to load PNG: {png_path}")
            src_size = img.size()
            target = fit_contain(float(src_size.width), float(src_size.height), content)
            img.drawInRect_(NSMakeRect(target.x, target.y, target.w, target.h))

        NSGraphicsContext.restoreGraphicsState()

        ensure_parent_dir(out_path)
        props = NSDictionary.dictionaryWithObject_forKey_(quality, "NSImageCompressionFactor")
        data = rep.representationUsingType_properties_(NSJPEGFileType, props)
        if not data:
            raise RuntimeError("Failed to encode JPEG.")
        ok = data.writeToFile_atomically_(out_path, True)
        if not ok:
            raise RuntimeError(f"Failed to write output: {out_path}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate UI wireframe sheet (JPEG) from SVG wireframes.")
    parser.add_argument(
        "--out",
        default=os.path.join("docs", "figures", "ui-wireframes-sheet.jpg"),
        help="Output path (default: docs/figures/ui-wireframes-sheet.jpg)",
    )
    parser.add_argument("--thumb-size", type=int, default=1400, help="QuickLook thumbnail size (default: 1400)")
    parser.add_argument("--quality", type=float, default=0.92, help="JPEG quality (default: 0.92)")
    args = parser.parse_args()

    try:
        build_sheet(args.out, thumb_size=args.thumb_size, quality=args.quality)
    except subprocess.CalledProcessError as error:
        raise SystemExit(
            "Failed to rasterize SVG via `qlmanage`. "
            "If you're running inside a sandboxed environment, run this command with permission to execute `qlmanage`."
        ) from error

    print(os.path.abspath(args.out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

