#!/usr/bin/env python3
"""
Generate precise, UI-identical wireframes from the actual HTML/CSS screens.

Approach:
- Render each HTML screen using WKWebView (WebKit).
- Apply a wireframe-only CSS overlay:
  - Keep only the main H1 text
  - Replace all other text with grey placeholder shapes sized like the UI
- Take a snapshot.
- Export multiple variants per screen (desktop/tablet/mobile).

Outputs go to: docs/figures/wireframes-precise/
"""

from __future__ import annotations

import argparse
import os
import re
import tempfile
import time
from dataclasses import dataclass
from typing import Iterable

import Quartz
import objc
from AppKit import (
    NSBitmapImageRep,
    NSDeviceRGBColorSpace,
    NSGraphicsContext,
    NSImage,
    NSJPEGFileType,
    NSMakeRect,
)
from Foundation import NSDictionary, NSObject, NSURL, NSURLRequest
from WebKit import WKPreferences, WKSnapshotConfiguration, WKWebView, WKWebViewConfiguration, WKWebsiteDataStore

WKNavigationDelegate = objc.protocolNamed("WKNavigationDelegate")


@dataclass(frozen=True)
class Viewport:
    name: str
    width: int
    height: int


PAGES: list[tuple[str, str]] = [
    ("login", "index.html"),
    ("register", "register.html"),
    ("dashboard", "dashboard.html"),
    ("voting", "voting.html"),
    ("results", "results.html"),
    ("admin", "admin.html"),
]

VIEWPORTS: list[Viewport] = [
    Viewport("desktop", 1440, 900),
    Viewport("tablet", 834, 1112),
    Viewport("mobile", 390, 844),
]


class _NavDelegate(NSObject, protocols=[WKNavigationDelegate]):  # type: ignore[misc]
    def initWithDone_(self, done):  # noqa: N802
        self = objc.super(_NavDelegate, self).init()
        if self is None:
            return None
        self._done = done
        self._failed = None
        return self

    def webView_didFinishNavigation_(self, _webview, _nav):  # noqa: N802
        self._done["done"] = True

    def webView_didFailNavigation_withError_(self, _webview, _nav, error):  # noqa: N802
        self._failed = error
        self._done["done"] = True

    def webView_didFailProvisionalNavigation_withError_(self, _webview, _nav, error):  # noqa: N802
        self._failed = error
        self._done["done"] = True


def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def _ci_filter(name: str, **kwargs):
    flt = Quartz.CIFilter.filterWithName_(name)
    if flt is None:
        raise RuntimeError(f"Missing CoreImage filter: {name}")
    flt.setDefaults()
    for key, value in kwargs.items():
        flt.setValue_forKey_(value, key)
    return flt


WIREFRAME_CSS = r"""
:root {
  --wf-ink: #111827;
  --wf-muted: #d1d5db;
  --wf-muted-2: #e5e7eb;
}

* {
  text-shadow: none !important;
  box-shadow: none !important;
}

html, body {
  background: #ffffff !important;
}

/* Keep only the main title readable. */
h1, h1 * {
  color: var(--wf-ink) !important;
  -webkit-text-fill-color: var(--wf-ink) !important;
  background: transparent !important;
}

/* Turn almost all other text into grey placeholder blocks sized like the original text. */
p, span, li, a, label, small, strong, em,
h2, h3, h4, h5, h6,
td, th, button {
  color: transparent !important;
  -webkit-text-fill-color: transparent !important;
  background-color: var(--wf-muted) !important;
  border-radius: 7px !important;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}

/* Buttons/links should look like outlined wireframe controls. */
a, button {
  background-color: var(--wf-muted-2) !important;
  border: 2px solid var(--wf-muted) !important;
}

/* Inputs: keep borders, hide value + placeholder. */
input, textarea, select {
  background: #ffffff !important;
  border: 2px solid var(--wf-muted) !important;
  color: transparent !important;
  -webkit-text-fill-color: transparent !important;
}
::placeholder {
  color: transparent !important;
  -webkit-text-fill-color: transparent !important;
}

/* Structural containers as simple outlines. */
.panel, .card, .form-card, .table-card, .transaction-box, .note-box, .metric-card, .navbar {
  background: #ffffff !important;
  border: 2px solid var(--wf-muted) !important;
}

/* Pills/tags/messages become plain grey shapes. */
.tag, .status-pill, .message {
  color: transparent !important;
  -webkit-text-fill-color: transparent !important;
  background-color: var(--wf-muted-2) !important;
  border: 2px solid var(--wf-muted) !important;
  border-radius: 999px !important;
}

/* Hide decorative illustration details; keep faint placeholder. */
svg, img, .figure-illustration, .hero-figure, .auth-figure {
  opacity: 0.10 !important;
  filter: grayscale(1) contrast(0.8) !important;
}
"""


def project_root() -> str:
    return os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))


def to_file_url_dir(path: str) -> str:
    # file URL directory; WKWebView + <base> works well with this.
    p = os.path.abspath(path)
    if not p.endswith(os.sep):
        p += os.sep
    return "file://" + p


def make_wireframe_html(original_html_path: str, *, tmp_dir: str) -> str:
    with open(original_html_path, "r", encoding="utf-8") as handle:
        html = handle.read()

    base_href = to_file_url_dir(project_root())

    injection = f'\n    <base href="{base_href}" />\n    <style>{WIREFRAME_CSS}</style>\n'

    # Insert into <head> if possible, else prepend.
    if re.search(r"<head[^>]*>", html, flags=re.IGNORECASE):
        html = re.sub(r"(<head[^>]*>)", r"\1" + injection, html, count=1, flags=re.IGNORECASE)
    else:
        html = injection + html

    out_path = os.path.join(tmp_dir, os.path.basename(original_html_path).replace(".html", ".wireframe.html"))
    with open(out_path, "w", encoding="utf-8") as handle:
        handle.write(html)
    return out_path


def nsimage_to_cgimage(image: NSImage):
    tiff = image.TIFFRepresentation()
    rep = NSBitmapImageRep.imageRepWithData_(tiff)
    if rep is None:
        raise RuntimeError("Failed to create bitmap rep from snapshot.")
    cg = rep.CGImage()
    if cg is None:
        raise RuntimeError("Failed to extract CGImage from snapshot.")
    return cg


def cgimage_to_jpeg(cgimage, out_path: str, *, quality: float) -> None:
    rep = NSBitmapImageRep.alloc().initWithCGImage_(cgimage)
    data = rep.representationUsingType_properties_(
        NSJPEGFileType,
        NSDictionary.dictionaryWithObject_forKey_(quality, "NSImageCompressionFactor"),
    )
    if not data:
        raise RuntimeError("Failed to encode JPEG.")
    ok = data.writeToFile_atomically_(out_path, True)
    if not ok:
        raise RuntimeError(f"Failed to write file: {out_path}")


def render_html_snapshot(file_path: str, *, width: int, height: int, timeout_s: float = 10.0) -> NSImage:
    url = NSURL.fileURLWithPath_(os.path.abspath(file_path))
    request = NSURLRequest.requestWithURL_(url)

    config = WKWebViewConfiguration.alloc().init()
    # Avoid WebKit writing under ~/Library (sandbox may block this).
    config.setWebsiteDataStore_(WKWebsiteDataStore.nonPersistentDataStore())
    prefs = WKPreferences.alloc().init()
    # JS not required (we render a static wireframe); keep off to avoid app.js redirects/fetch.
    prefs.setJavaScriptEnabled_(False)
    config.setPreferences_(prefs)

    webview = WKWebView.alloc().initWithFrame_configuration_(NSMakeRect(0, 0, width, height), config)
    done = {"done": False}
    delegate = _NavDelegate.alloc().initWithDone_(done)
    webview.setNavigationDelegate_(delegate)

    webview.loadRequest_(request)

    # Run the CFRunLoop until done/timeout.
    start = time.time()
    while not done["done"] and (time.time() - start) < timeout_s:
        Quartz.CFRunLoopRunInMode(Quartz.kCFRunLoopDefaultMode, 0.05, False)

    if not done["done"]:
        raise TimeoutError(f"Timed out loading {file_path}")

    result: dict[str, object] = {"image": None}

    snapshot_cfg = WKSnapshotConfiguration.alloc().init()
    snapshot_cfg.setRect_(NSMakeRect(0, 0, width, height))

    def _handler(img, err):
        if err is not None:
            result["error"] = err
        result["image"] = img

    webview.takeSnapshotWithConfiguration_completionHandler_(snapshot_cfg, _handler)
    # wait snapshot completion
    snap_start = time.time()
    while result.get("image") is None and (time.time() - snap_start) < timeout_s:
        Quartz.CFRunLoopRunInMode(Quartz.kCFRunLoopDefaultMode, 0.05, False)

    if result.get("image") is None:
        raise TimeoutError(f"Timed out taking snapshot for {file_path}")
    if result.get("error") is not None:
        raise RuntimeError(f"Snapshot failed for {file_path}: {result['error']}")

    return result["image"]  # type: ignore[return-value]


def generate_for_page(
    page_slug: str,
    html_path: str,
    *,
    viewports: Iterable[Viewport],
    out_dir: str,
    quality: float,
    also_save_screenshots: bool,
) -> None:
    with tempfile.TemporaryDirectory(prefix="blockvote-wireframe-html-") as tmp:
        wireframe_html = make_wireframe_html(html_path, tmp_dir=tmp)

        for vp in viewports:
            # Optional: save actual UI screenshot for reference (render original HTML).
            if also_save_screenshots:
                snapshot_ui = render_html_snapshot(html_path, width=vp.width, height=vp.height)
                cg_ui = nsimage_to_cgimage(snapshot_ui)
                ensure_dir(os.path.join(out_dir, "screenshots"))
                cgimage_to_jpeg(
                    cg_ui,
                    os.path.join(out_dir, "screenshots", f"{page_slug}-{vp.name}.jpg"),
                    quality=quality,
                )

            # Wireframe snapshot (CSS overlay).
            snapshot_wf = render_html_snapshot(wireframe_html, width=vp.width, height=vp.height)
            cg_wf = nsimage_to_cgimage(snapshot_wf)
            out_path = os.path.join(out_dir, f"{page_slug}-{vp.name}-wireframe.jpg")
            ensure_dir(out_dir)
            cgimage_to_jpeg(cg_wf, out_path, quality=quality)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate precise UI-identical wireframes from HTML screens.")
    parser.add_argument(
        "--out-dir",
        default=os.path.join("docs", "figures", "wireframes-precise"),
        help="Output directory (default: docs/figures/wireframes-precise)",
    )
    parser.add_argument("--quality", type=float, default=0.92, help="JPEG quality (default: 0.92)")
    parser.add_argument("--screenshots", action="store_true", help="Also export real UI screenshots for reference")
    args = parser.parse_args()

    # Ensure we can create an offscreen graphics context (required by some NSImage conversions).
    NSGraphicsContext.currentContext()

    for slug, html in PAGES:
        if not os.path.exists(html):
            raise FileNotFoundError(f"Missing HTML page: {html}")
        generate_for_page(
            slug,
            html,
            viewports=VIEWPORTS,
            out_dir=args.out_dir,
            quality=args.quality,
            also_save_screenshots=args.screenshots,
        )

    print(os.path.abspath(args.out_dir))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
