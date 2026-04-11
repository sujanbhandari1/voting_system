#!/usr/bin/env python3
"""
Generate a system wireframe (architecture) diagram JPEG for this project.

Offline-friendly: uses macOS AppKit/CoreGraphics via PyObjC (no pip deps).
"""

from __future__ import annotations

import argparse
import math
import os
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
    NSLineBreakByWordWrapping,
    NSMakeRect,
    NSParagraphStyleAttributeName,
    NSShadow,
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

    @property
    def cx(self) -> float:
        return self.x + self.w / 2

    @property
    def cy(self) -> float:
        return self.y + self.h / 2


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


def _paragraph(align: str = "left"):
    from AppKit import NSMutableParagraphStyle, NSCenterTextAlignment, NSLeftTextAlignment

    style = NSMutableParagraphStyle.alloc().init()
    style.setLineBreakMode_(NSLineBreakByWordWrapping)
    style.setAlignment_(NSCenterTextAlignment if align == "center" else NSLeftTextAlignment)
    return style


def draw_text(
    text: str,
    rect: Rect,
    *,
    size: float,
    color: NSColor,
    bold: bool = False,
    align: str = "left",
):
    attrs = {
        NSFontAttributeName: _font(size, bold=bold),
        NSForegroundColorAttributeName: color,
        NSParagraphStyleAttributeName: _paragraph(align=align),
    }
    NSAttributedString.alloc().initWithString_attributes_(text, attrs).drawWithRect_options_(  # type: ignore[attr-defined]
        NSMakeRect(rect.x, rect.y, rect.w, rect.h),
        NSStringDrawingUsesLineFragmentOrigin,
    )


def draw_round_rect(
    rect: Rect,
    *,
    radius: float,
    fill: NSColor,
    stroke: NSColor,
    stroke_width: float = 2.0,
    shadow: bool = False,
):
    path = NSBezierPath.bezierPathWithRoundedRect_xRadius_yRadius_(NSMakeRect(rect.x, rect.y, rect.w, rect.h), radius, radius)
    if shadow:
        s = NSShadow.alloc().init()
        s.setShadowOffset_((0.0, -2.0))
        s.setShadowBlurRadius_(12.0)
        s.setShadowColor_(_nscolor("#000000", 0.16))
        s.set()

    fill.setFill()
    path.fill()

    if shadow:
        NSShadow.alloc().init().set()

    stroke.setStroke()
    path.setLineWidth_(stroke_width)
    path.stroke()


def draw_arrow(x1: float, y1: float, x2: float, y2: float, *, color: NSColor, width: float = 3.0):
    path = NSBezierPath.bezierPath()
    path.moveToPoint_((x1, y1))
    path.lineToPoint_((x2, y2))
    color.setStroke()
    path.setLineWidth_(width)
    path.stroke()

    angle = math.atan2(y2 - y1, x2 - x1)
    head_len = 14.0
    head_angle = math.radians(24.0)
    ax1 = x2 - head_len * math.cos(angle - head_angle)
    ay1 = y2 - head_len * math.sin(angle - head_angle)
    ax2 = x2 - head_len * math.cos(angle + head_angle)
    ay2 = y2 - head_len * math.sin(angle + head_angle)
    head = NSBezierPath.bezierPath()
    head.moveToPoint_((x2, y2))
    head.lineToPoint_((ax1, ay1))
    head.lineToPoint_((ax2, ay2))
    head.closePath()
    color.setFill()
    head.fill()


def ensure_parent_dir(path: str) -> None:
    parent = os.path.dirname(os.path.abspath(path))
    if parent:
        os.makedirs(parent, exist_ok=True)


def build_diagram(out_path: str, *, width: int = 2400, height: int = 1400, quality: float = 0.92) -> None:
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

    # Colors (lo-fi wireframe style)
    bg = _nscolor("#f3f4f6", 1.0)
    panel = _nscolor("#ffffff", 1.0)
    panel_border = _nscolor("#111827", 1.0)
    card = _nscolor("#ffffff", 1.0)
    card_border = _nscolor("#111827", 1.0)
    text_primary = _nscolor("#111827", 1.0)
    text_muted = _nscolor("#4b5563", 1.0)
    ink = _nscolor("#111827", 1.0)
    blue = ink
    green = ink
    orange = ink
    purple = ink
    line = _nscolor("#111827", 0.95)

    # Background
    bg.setFill()
    NSBezierPath.bezierPathWithRect_(NSMakeRect(0.0, 0.0, float(width), float(height))).fill()

    margin = 70.0
    header_h = 170.0

    draw_text(
        "Blockchain Voting System – System Wireframe",
        Rect(margin, 42.0, width - margin * 2, 72.0),
        size=48,
        color=text_primary,
        bold=True,
    )
    draw_text(
        "High-level components and data flows (UI ↔ API ↔ DB / Blockchain).",
        Rect(margin, 110.0, width - margin * 2, 48.0),
        size=22,
        color=text_muted,
    )

    content_top = header_h
    content_h = height - content_top - margin

    canvas = Rect(margin, content_top, width - margin * 2, content_h)
    draw_round_rect(canvas, radius=22.0, fill=panel, stroke=panel_border, stroke_width=3.0)

    # Layout grid (3 columns)
    gap = 52.0
    col_w = (canvas.w - gap * 2 - 90.0) / 3.0
    x1 = canvas.x + 45.0
    x2 = x1 + col_w + gap
    x3 = x2 + col_w + gap
    top = canvas.y + 70.0

    # Left: Client
    client = Rect(x1, top, col_w, 470.0)
    draw_round_rect(client, radius=18.0, fill=card, stroke=card_border, stroke_width=2.5, shadow=False)
    draw_text("Client (Browser)", Rect(client.x + 22, client.y + 18, client.w - 44, 34), size=26, color=text_primary, bold=True)
    draw_text(
        "Static UI pages\n- index.html (Login)\n- register.html\n- dashboard.html\n- voting.html\n- results.html\n- admin.html\n\nFrontend logic: app.js\nStyles: styles.css",
        Rect(client.x + 22, client.y + 58, client.w - 44, client.h - 80),
        size=18,
        color=text_muted,
    )
    # Tag stripe
    draw_round_rect(Rect(client.x, client.y, 10.0, client.h), radius=8.0, fill=card, stroke=card_border, stroke_width=2.0)

    # Middle: Server
    server = Rect(x2, top, col_w, 470.0)
    draw_round_rect(server, radius=18.0, fill=card, stroke=card_border, stroke_width=2.5, shadow=False)
    draw_text("Node.js Server", Rect(server.x + 22, server.y + 18, server.w - 44, 34), size=26, color=text_primary, bold=True)
    draw_text(
        "server.js\nREST API (JSON)\n- Auth: /api/login, /api/logout, /api/session\n- Voter: /api/dashboard, /api/election, /api/vote\n- Results: /api/results\n- Admin: /api/admin/users, /api/admin/election, /toggle, /results-visibility\n\nSecurity: JWT in HttpOnly cookie",
        Rect(server.x + 22, server.y + 58, server.w - 44, server.h - 80),
        size=18,
        color=text_muted,
    )
    draw_round_rect(Rect(server.x, server.y, 10.0, server.h), radius=8.0, fill=card, stroke=card_border, stroke_width=2.0)

    # Right: Data / chain cluster
    data_cluster = Rect(x3, top, col_w, 470.0)
    draw_round_rect(data_cluster, radius=18.0, fill=card, stroke=card_border, stroke_width=2.5, shadow=False)
    draw_text("Data & Blockchain", Rect(data_cluster.x + 22, data_cluster.y + 18, data_cluster.w - 44, 34), size=26, color=text_primary, bold=True)
    draw_round_rect(Rect(data_cluster.x, data_cluster.y, 10.0, data_cluster.h), radius=8.0, fill=card, stroke=card_border, stroke_width=2.0)

    # Inside cluster: Mongo + Ganache + Contract
    inner_gap = 22.0
    inner_h = (data_cluster.h - 82.0 - inner_gap * 2) / 3.0
    inner_x = data_cluster.x + 22.0
    inner_w = data_cluster.w - 44.0
    y_mongo = data_cluster.y + 62.0
    y_ganache = y_mongo + inner_h + inner_gap
    y_contract = y_ganache + inner_h + inner_gap

    mongo = Rect(inner_x, y_mongo, inner_w, inner_h)
    ganache = Rect(inner_x, y_ganache, inner_w, inner_h)
    contract = Rect(inner_x, y_contract, inner_w, inner_h)

    for r in (mongo, ganache, contract):
        draw_round_rect(r, radius=14.0, fill=card, stroke=card_border, stroke_width=2.0)

    draw_text("MongoDB", Rect(mongo.x + 18, mongo.y + 14, mongo.w - 36, 28), size=22, color=text_primary, bold=True)
    draw_text("Stores users, roles, approval status,\nand election metadata.", Rect(mongo.x + 18, mongo.y + 46, mongo.w - 36, mongo.h - 56), size=17, color=text_muted)

    draw_text("Ganache (Local EVM)", Rect(ganache.x + 18, ganache.y + 14, ganache.w - 36, 28), size=22, color=text_primary, bold=True)
    draw_text("Local blockchain network for demo.\nServer connects via ethers.", Rect(ganache.x + 18, ganache.y + 46, ganache.w - 36, ganache.h - 56), size=17, color=text_muted)

    draw_text("Smart Contract", Rect(contract.x + 18, contract.y + 14, contract.w - 36, 28), size=22, color=text_primary, bold=True)
    draw_text("Election config + vote recording.\nTransactions return hashes for UI.", Rect(contract.x + 18, contract.y + 46, contract.w - 36, contract.h - 56), size=17, color=text_muted)

    # Lower: key flows boxes
    flow_top = top + 520.0
    flow_h = canvas.y2 - 34.0 - flow_top
    flows = Rect(canvas.x + 45.0, flow_top, canvas.w - 90.0, flow_h)
    draw_round_rect(flows, radius=18.0, fill=card, stroke=card_border, stroke_width=2.5)
    draw_text("Key Flows (Wireframe)", Rect(flows.x + 22, flows.y + 18, flows.w - 44, 28), size=22, color=text_primary, bold=True)

    flow_col_gap = 28.0
    flow_col_w = (flows.w - 44.0 - flow_col_gap * 2) / 3.0
    fx1 = flows.x + 22.0
    fx2 = fx1 + flow_col_w + flow_col_gap
    fx3 = fx2 + flow_col_w + flow_col_gap
    fy = flows.y + 58.0
    fh = flows.h - 80.0

    f1 = Rect(fx1, fy, flow_col_w, fh)
    f2 = Rect(fx2, fy, flow_col_w, fh)
    f3 = Rect(fx3, fy, flow_col_w, fh)

    for rect, stripe, title in (
        (f1, blue, "Auth & Session"),
        (f2, green, "Vote Submission"),
        (f3, orange, "Admin Controls"),
    ):
        draw_round_rect(rect, radius=14.0, fill=card, stroke=card_border, stroke_width=2.0)
        draw_round_rect(Rect(rect.x, rect.y, 8.0, rect.h), radius=6.0, fill=card, stroke=card_border, stroke_width=2.0)
        draw_text(title, Rect(rect.x + 16, rect.y + 12, rect.w - 24, 26), size=20, color=text_primary, bold=True)

    draw_text(
        "Login/register in UI\n→ POST /api/login or /api/register\n→ Server issues JWT cookie\n→ UI calls GET /api/session\n→ Navbar shows role",
        Rect(f1.x + 16, f1.y + 44, f1.w - 24, f1.h - 54),
        size=16,
        color=text_muted,
    )

    draw_text(
        "Dashboard checks:\n- Approved user\n- Election active\n\nVote page:\n→ POST /api/vote\n→ Server writes tx to chain\n→ Returns tx hash to UI",
        Rect(f2.x + 16, f2.y + 44, f2.w - 24, f2.h - 54),
        size=16,
        color=text_muted,
    )

    draw_text(
        "Admin page:\n- Approve/reject users\n- Create election + candidates\n- Start/stop voting\n- Toggle results visibility\n\nAll via /api/admin/*",
        Rect(f3.x + 16, f3.y + 44, f3.w - 24, f3.h - 54),
        size=16,
        color=text_muted,
    )

    # Arrows between main components
    draw_arrow(client.x2 + 10, client.cy, server.x - 10, server.cy, color=line, width=4.0)
    draw_text("HTTPS (fetch)\nJSON + cookies", Rect((client.x2 + server.x) / 2 - 90, client.cy - 38, 180, 48), size=16, color=text_muted, align="center")

    draw_arrow(server.x2 + 10, server.y + 135.0, mongo.x - 10, mongo.cy, color=line, width=3.5)
    draw_text("Read/write\nusers + election", Rect((server.x2 + mongo.x) / 2 - 90, mongo.cy - 34, 180, 44), size=15, color=text_muted, align="center")

    draw_arrow(server.x2 + 10, server.y + 260.0, ganache.x - 10, ganache.cy, color=line, width=3.5)
    draw_text("ethers RPC\ntransactions", Rect((server.x2 + ganache.x) / 2 - 90, ganache.cy - 34, 180, 44), size=15, color=text_muted, align="center")

    draw_arrow(ganache.cx, ganache.y2 + 10, contract.cx, contract.y - 10, color=line, width=3.5)
    draw_text("Executes\ncontract calls", Rect(contract.cx - 90, (ganache.y2 + contract.y) / 2 - 26, 180, 44), size=15, color=text_muted, align="center")

    # Footer hint (existing SVG)
    draw_text(
        "Existing diagram (SVG): docs/figures/image3-system-architecture.svg",
        Rect(margin, height - 62.0, width - margin * 2, 40.0),
        size=16,
        color=text_muted,
    )

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
    parser = argparse.ArgumentParser(description="Generate system wireframe diagram (JPEG).")
    parser.add_argument(
        "--out",
        default=os.path.join("docs", "figures", "system-wireframe-diagram.jpg"),
        help="Output path (default: docs/figures/system-wireframe-diagram.jpg)",
    )
    parser.add_argument("--width", type=int, default=2400)
    parser.add_argument("--height", type=int, default=1400)
    parser.add_argument("--quality", type=float, default=0.92)
    args = parser.parse_args()

    build_diagram(args.out, width=args.width, height=args.height, quality=args.quality)
    print(os.path.abspath(args.out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
