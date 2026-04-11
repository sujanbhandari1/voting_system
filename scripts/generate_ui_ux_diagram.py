#!/usr/bin/env python3
"""
Generate a UI/UX flow diagram JPEG for this project.

Runs fully offline using macOS AppKit/CoreGraphics via PyObjC (no third-party pip deps).
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
    if align == "center":
        style.setAlignment_(NSCenterTextAlignment)
    else:
        style.setAlignment_(NSLeftTextAlignment)
    return style


def draw_text(
    text: str,
    rect: Rect,
    *,
    size: float,
    color: NSColor,
    bold: bool = False,
    align: str = "left",
    canvas_height: float | None = None,
):
    if canvas_height is not None:
        rect = Rect(rect.x, canvas_height - rect.y - rect.h, rect.w, rect.h)
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
    canvas_height: float | None = None,
):
    if canvas_height is not None:
        rect = Rect(rect.x, canvas_height - rect.y - rect.h, rect.w, rect.h)
    path = NSBezierPath.bezierPathWithRoundedRect_xRadius_yRadius_(NSMakeRect(rect.x, rect.y, rect.w, rect.h), radius, radius)
    if shadow:
        s = NSShadow.alloc().init()
        s.setShadowOffset_((0.0, -2.0))
        s.setShadowBlurRadius_(10.0)
        s.setShadowColor_(_nscolor("#000000", 0.14))
        s.set()

    fill.setFill()
    path.fill()

    if shadow:
        NSShadow.alloc().init().set()  # reset

    stroke.setStroke()
    path.setLineWidth_(stroke_width)
    path.stroke()


def draw_arrow(
    x1: float,
    y1: float,
    x2: float,
    y2: float,
    *,
    color: NSColor,
    width: float = 3.0,
    canvas_height: float | None = None,
):
    if canvas_height is not None:
        y1 = canvas_height - y1
        y2 = canvas_height - y2
    path = NSBezierPath.bezierPath()
    path.moveToPoint_((x1, y1))
    path.lineToPoint_((x2, y2))
    color.setStroke()
    path.setLineWidth_(width)
    path.stroke()

    # arrow head
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

    # Palette
    bg = _nscolor("#0b1220", 1.0)
    panel = _nscolor("#0f1b2d", 1.0)
    panel_border = _nscolor("#1f2d45", 1.0)
    card = _nscolor("#0f2236", 1.0)
    card_border = _nscolor("#2a4468", 1.0)
    text_primary = _nscolor("#e6edf3", 1.0)
    text_muted = _nscolor("#9fb0c0", 1.0)
    accent_blue = _nscolor("#1f6feb", 1.0)
    accent_green = _nscolor("#1f9d7a", 1.0)
    accent_orange = _nscolor("#f59e0b", 1.0)

    ch = float(height)

    def DT(*args, **kwargs):
        return draw_text(*args, **kwargs, canvas_height=ch)

    def RR(*args, **kwargs):
        return draw_round_rect(*args, **kwargs, canvas_height=ch)

    def AR(*args, **kwargs):
        return draw_arrow(*args, **kwargs, canvas_height=ch)

    # Background
    bg.setFill()
    NSBezierPath.bezierPathWithRect_(NSMakeRect(0.0, 0.0, float(width), float(height))).fill()

    margin = 70.0
    header_h = 170.0

    # Title
    DT(
        "Blockchain Voting System – UI/UX Flow",
        Rect(margin, 42.0, width - margin * 2, 72.0),
        size=48,
        color=text_primary,
        bold=True,
    )
    DT(
        "Pages (HTML) + main user journeys (voter/admin) and key gating rules.",
        Rect(margin, 110.0, width - margin * 2, 48.0),
        size=22,
        color=text_muted,
    )

    # Lane panels
    content_top = header_h
    content_h = height - content_top - margin
    lane_gap = 36.0
    lane_w = (width - margin * 2 - lane_gap * 2) / 3.0

    lane_auth = Rect(margin, content_top, lane_w, content_h)
    lane_voter = Rect(margin + lane_w + lane_gap, content_top, lane_w, content_h)
    lane_admin = Rect(margin + (lane_w + lane_gap) * 2, content_top, lane_w, content_h)

    for lane in (lane_auth, lane_voter, lane_admin):
        RR(lane, radius=26.0, fill=panel, stroke=panel_border, stroke_width=2.0)

    def lane_title(lane: Rect, title: str, subtitle: str, color: NSColor):
        DT(title, Rect(lane.x + 28, lane.y + 18, lane.w - 56, 40), size=28, color=color, bold=True)
        DT(subtitle, Rect(lane.x + 28, lane.y + 56, lane.w - 56, 56), size=18, color=text_muted)

    lane_title(lane_auth, "Public & Auth", "Entry points + session", accent_blue)
    lane_title(lane_voter, "Voter Journey", "Dashboard → Vote → Results", accent_green)
    lane_title(lane_admin, "Admin Journey", "Approval + election controls", accent_orange)

    # Cards
    card_pad = 24.0
    card_h = 150.0
    small_h = 110.0
    gap_y = 34.0
    y0 = content_top + 120.0

    login = Rect(lane_auth.x + card_pad, y0, lane_auth.w - card_pad * 2, card_h)
    register = Rect(lane_auth.x + card_pad, y0 + card_h + gap_y, lane_auth.w - card_pad * 2, card_h)
    session = Rect(lane_auth.x + card_pad, y0 + (card_h + gap_y) * 2, lane_auth.w - card_pad * 2, small_h)

    dashboard = Rect(lane_voter.x + card_pad, y0, lane_voter.w - card_pad * 2, card_h)
    vote = Rect(lane_voter.x + card_pad, y0 + card_h + gap_y, lane_voter.w - card_pad * 2, card_h)
    results = Rect(lane_voter.x + card_pad, y0 + (card_h + gap_y) * 2, lane_voter.w - card_pad * 2, card_h)

    approvals = Rect(lane_admin.x + card_pad, y0, lane_admin.w - card_pad * 2, card_h)
    create_election = Rect(lane_admin.x + card_pad, y0 + card_h + gap_y, lane_admin.w - card_pad * 2, card_h)
    controls = Rect(lane_admin.x + card_pad, y0 + (card_h + gap_y) * 2, lane_admin.w - card_pad * 2, card_h)

    cards = [
        (login, "Login", "index.html\nPOST /api/login → redirects to Admin or Dashboard", accent_blue),
        (register, "Register", "register.html\nPOST /api/register → status: Pending Approval", accent_blue),
        (session, "Session & Navbar", "GET /api/session\nDashboard / Vote / Results (+ Admin if admin)", _nscolor("#7c3aed")),
        (dashboard, "Dashboard", "dashboard.html\nShows status + election overview\nVote enabled only when Approved + Active", accent_green),
        (vote, "Voting", "voting.html\nSelect candidate → POST /api/vote\nShows blockchain transaction hash", accent_green),
        (results, "Results", "results.html\nGET /api/results\nVisible when admin OR resultsVisibleToVoters", accent_green),
        (approvals, "User Approval", "admin.html\nApprove/Reject/Pending\nPOST /api/admin/users/:id/status", accent_orange),
        (create_election, "Create Election", "admin.html\nTitle + candidates + agenda\nPOST /api/admin/election", accent_orange),
        (controls, "Election Controls", "admin.html\nStart/End: POST /api/admin/election/toggle\nResults visibility: /results-visibility", accent_orange),
    ]

    for rect, title, body, tag_color in cards:
        RR(rect, radius=22.0, fill=card, stroke=card_border, stroke_width=2.0, shadow=True)
        # Tag stripe
        stripe = Rect(rect.x, rect.y, 10.0, rect.h)
        RR(stripe, radius=8.0, fill=tag_color, stroke=tag_color, stroke_width=1.0)
        DT(title, Rect(rect.x + 24, rect.y + 18, rect.w - 48, 34), size=26, color=text_primary, bold=True)
        DT(body, Rect(rect.x + 24, rect.y + 56, rect.w - 48, rect.h - 70), size=18, color=text_muted)

    # Flow arrows
    arrow = _nscolor("#cbd5e1", 0.95)

    # Auth flows
    AR(login.cx, login.y2, register.cx, register.y, color=arrow, width=3.0)  # login → register (link)
    DT(
        "New voter",
        Rect(login.cx - 80, register.y - 34, 160, 24),
        size=16,
        color=text_muted,
        align="center",
    )

    # Register → Admin approvals
    AR(register.x2, register.cy, approvals.x, approvals.cy, color=arrow, width=3.0)
    DT(
        "Admin reviews",
        Rect((register.x2 + approvals.x) / 2 - 100, register.cy - 28, 200, 24),
        size=16,
        color=text_muted,
        align="center",
    )

    # Login → Dashboard / Admin (role-based)
    AR(login.x2, login.cy, dashboard.x, dashboard.cy - 30, color=arrow, width=3.0)
    DT(
        "role=voter",
        Rect((login.x2 + dashboard.x) / 2 - 90, dashboard.cy - 68, 180, 24),
        size=16,
        color=text_muted,
        align="center",
    )
    AR(login.x2, login.cy + 36, approvals.x, approvals.cy - 30, color=arrow, width=3.0)
    DT(
        "role=admin",
        Rect((login.x2 + approvals.x) / 2 - 90, approvals.cy - 68, 180, 24),
        size=16,
        color=text_muted,
        align="center",
    )

    # Admin approvals → Dashboard gating
    AR(approvals.x, approvals.cy + 32, dashboard.x2, dashboard.cy, color=arrow, width=3.0)
    DT(
        "Approved user\ncan vote when election active",
        Rect(dashboard.x2 + 10, dashboard.cy - 44, 220, 54),
        size=15,
        color=text_muted,
    )

    # Admin election creation → Voter pages
    AR(create_election.x, create_election.cy, vote.x2, vote.cy, color=arrow, width=3.0)
    DT(
        "Creates candidates\naffect voting list",
        Rect(vote.x2 + 10, vote.cy - 44, 220, 54),
        size=15,
        color=text_muted,
    )
    AR(controls.x, controls.cy, results.x2, results.cy, color=arrow, width=3.0)
    DT(
        "Toggles result visibility\naffects /results access",
        Rect(results.x2 + 10, results.cy - 44, 240, 54),
        size=15,
        color=text_muted,
    )

    # Voter journey
    AR(dashboard.cx, dashboard.y2, vote.cx, vote.y, color=accent_green, width=4.0)
    AR(vote.cx, vote.y2, results.cx, results.y, color=accent_green, width=4.0)
    DT(
        "Approved + election active",
        Rect(vote.cx - 160, vote.y - 34, 320, 24),
        size=16,
        color=_nscolor("#a7f3d0"),
        align="center",
    )

    # Shared session card connections
    AR(session.x2, session.cy, dashboard.x, dashboard.y2 + 24, color=arrow, width=2.5)
    AR(session.x2, session.cy, results.x, results.y2 + 24, color=arrow, width=2.5)
    AR(session.x2, session.cy, approvals.x, approvals.y2 + 24, color=arrow, width=2.5)

    # Footer note
    DT(
        "Tip: Use the existing wireframe SVGs in docs/figures/ for page-level UI layouts (login/register/dashboard/voting/results/admin).",
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
    parser = argparse.ArgumentParser(description="Generate UI/UX flow diagram (JPEG).")
    parser.add_argument(
        "--out",
        default=os.path.join("docs", "figures", "ui-ux-flow-diagram.jpg"),
        help="Output path (default: docs/figures/ui-ux-flow-diagram.jpg)",
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
