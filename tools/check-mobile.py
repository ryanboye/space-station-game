#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["httpx"]
# ///
"""Pre-flight mobile baseline check for any HTML surface on sebland.

Runs the 9-item mobile checklist from sebland-app/SKILL.md against an HTML
document (local file or URL) and prints PASS/FAIL per item.

Exit 0 = all pass. Exit 1 = one or more fail. Agents MUST run this before
declaring an app "done" — it's the mechanical gate that stops Sam having
to remind us about mobile fixes every time.

Usage:
  check-mobile.py <file.html>
  check-mobile.py <url>
  check-mobile.py https://memory.sebland.com/<uuid>/

Checks:
  1. viewport meta has maximum-scale=1.0 AND user-scalable=no
  2. -webkit-text-size-adjust: 100% present (or unprefixed text-size-adjust)
  3. touch-action: manipulation on html/body  (or 'none' for canvas apps)
  4. inputs/selects/textareas appear to use font-size >= 16px
     (heuristic: any rule targeting them with font-size < 16px → FAIL)
  5. grid/flex children with min-width: 0 present (if any `display: grid`
     or `display: flex` in the stylesheet). Skipped if no grid/flex found.
  6. canvas/chart protection (§3d) — if the app embeds an interactive
     <canvas> in a scrolling page (Chart.js, D3, Three.js, Leaflet, Pixi,
     Plotly, ECharts, Cesium, etc.), the canvas + container must set
     user-select: none, -webkit-touch-callout: none, touch-action: none.
     Stops iOS text-selection magnifier loupe AND lets the lib cleanly
     capture pinch/pan. Skipped for fullscreen canvas games (§3c, which
     already applies touch-action: none on html/body) and for apps with
     no canvas/chart lib detected.
  7. html has an explicit background color/image set — prevents white
     flash on iOS rubber-band overscroll AND white bars in the safe-area
     zones when viewport-fit=cover is set.
  8. if viewport-fit=cover is set, body uses env(safe-area-inset-*) in
     padding (else content is hidden behind notch/home-indicator).
  9. iOS PWA hints (optional — not a blocker).

This is a static check — it doesn't catch everything. Playwright at
390x844 is still the final word. But this catches the common misses.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path


def fetch(target: str) -> str:
  """Fetch the page AND inline any linked stylesheets.

  Bundled apps (Vite, Webpack, etc.) inject CSS via <link rel="stylesheet">
  — the bare index.html shell is < 2KB and has no CSS rules in it. If we
  don't follow those links, the CSS-dependent checks (text-size-adjust,
  touch-action, input font-size, min-width:0) all false-fail.

  Strategy: fetch the HTML, find every <link rel=stylesheet>, fetch each
  (resolving relative URLs against the target), and append a synthetic
  <style>…</style> block with the concatenated CSS. This keeps the regex
  checks below untouched.
  """
  if target.startswith(("http://", "https://")):
    import httpx
    from urllib.parse import urljoin

    with httpx.Client(follow_redirects=True, timeout=15) as client:
      r = client.get(target)
      r.raise_for_status()
      html = r.text
      # Find stylesheet links. Deliberately permissive about attribute order.
      links = re.findall(
        r'<link\b(?=[^>]*\brel=["\']stylesheet["\'])[^>]*\bhref=["\']([^"\']+)["\'][^>]*>',
        html,
        re.I,
      )
      extra_css = []
      for href in links:
        if href.startswith("data:"):
          continue
        url = urljoin(target, href)
        # Skip obvious CDN CSS (leaflet.css, google fonts, etc.) — we only
        # care about the app's own stylesheets. Heuristic: same-origin only.
        try:
          from urllib.parse import urlparse
          if urlparse(url).netloc != urlparse(target).netloc:
            continue
          cr = client.get(url)
          if cr.is_success:
            extra_css.append(f"/* from {href} */\n{cr.text}")
        except Exception:
          pass
      if extra_css:
        html = html + "\n<style>\n" + "\n".join(extra_css) + "\n</style>\n"
      return html
  p = Path(target)
  if not p.is_file():
    sys.exit(f"not a file or URL: {target}")
  return p.read_text()


def check_viewport(html: str) -> tuple[bool, str]:
  m = re.search(
    r'<meta\s+name=["\']viewport["\']\s+content=["\']([^"\']+)["\']',
    html,
    re.I,
  )
  if not m:
    return False, "no <meta name=viewport> tag found"
  content = m.group(1).lower()
  missing = []
  if "maximum-scale=1" not in content.replace(" ", ""):
    missing.append("maximum-scale=1.0")
  if "user-scalable=no" not in content.replace(" ", ""):
    missing.append("user-scalable=no")
  if missing:
    return False, f"viewport missing: {', '.join(missing)} (got: {content!r})"
  return True, f"viewport ok ({content})"


def check_text_size_adjust(html: str) -> tuple[bool, str]:
  # Either prefixed or unprefixed is fine; both is best.
  has_webkit = bool(re.search(r"-webkit-text-size-adjust\s*:\s*100%", html, re.I))
  has_plain = bool(re.search(r"(?<!-)text-size-adjust\s*:\s*100%", html, re.I))
  if has_webkit or has_plain:
    variants = [v for v, ok in (("-webkit-", has_webkit), ("unprefixed", has_plain)) if ok]
    return True, f"text-size-adjust: 100% present ({'+'.join(variants)})"
  return False, "no text-size-adjust: 100% rule found — iOS will bump font sizes on rotate"


def check_touch_action(html: str) -> tuple[bool, str]:
  # Look for touch-action on html, body, or * selector.
  rules = re.findall(r"(html|body|\*)[^{]*\{[^}]*touch-action\s*:\s*(manipulation|none)", html, re.I)
  if rules:
    values = {r[1].lower() for r in rules}
    return True, f"touch-action set on html/body: {', '.join(values)}"
  return False, "no touch-action rule on html/body/* — double-tap zoom not blocked"


def check_input_font_size(html: str) -> tuple[bool, str]:
  # Find every rule that targets input/select/textarea with an explicit
  # font-size. Any < 16px is a fail.
  #
  # Heuristic — finds rules like:
  #   input, select, textarea { font-size: 14px }
  #   .search { font-size: 13px }  ← only flagged if class appears on input/etc
  # Primarily we catch the canonical input/select/textarea rule.
  offenders = []
  for m in re.finditer(
    r"([^{}\n]+)\{([^}]*)\}",
    html,
    re.S,
  ):
    selector, body = m.group(1).strip(), m.group(2)
    if not re.search(r"\b(input|select|textarea)\b", selector, re.I):
      continue
    # Skip pseudo-elements — they can't be focused, so their font-size
    # doesn't affect iOS zoom-on-focus. Catches ::before/::after/:checked:after
    # etc. where a decorative glyph is set on a form control.
    if re.search(r"::?\b(before|after|placeholder|first-line|first-letter|selection)\b", selector, re.I):
      continue
    fs = re.search(r"font-size\s*:\s*(\d+(?:\.\d+)?)(px|rem|em)?", body, re.I)
    if not fs:
      continue
    val, unit = float(fs.group(1)), (fs.group(2) or "px").lower()
    # Convert to px for comparison (assume 1rem = 16px default).
    px = val * 16 if unit == "rem" else val * 16 if unit == "em" else val
    if px < 16:
      offenders.append(f"{selector!r} → {val}{unit} ({px:.0f}px)")
  if offenders:
    return False, f"input font-size < 16px triggers iOS zoom-on-focus: {'; '.join(offenders)}"
  return True, "no input/select/textarea rule with font-size < 16px"


def check_grid_min_width(html: str) -> tuple[bool, str]:
  # If there's display: grid or display: flex in the CSS and the layout
  # uses fr units, we expect at least one `min-width: 0` somewhere in
  # the stylesheet (applied to grid/flex children).
  has_grid_or_flex = bool(
    re.search(r"display\s*:\s*(grid|flex)", html, re.I)
    or re.search(r"grid-template-columns\s*:", html, re.I)
  )
  if not has_grid_or_flex:
    return True, "no grid/flex layout detected — skip"
  has_min_width_zero = bool(re.search(r"min-width\s*:\s*0(?:px)?\b", html, re.I))
  if has_min_width_zero:
    return True, "min-width: 0 present (prevents grid/flex overflow on long UUIDs/paths)"
  return False, (
    "grid/flex layout without min-width: 0 — long unbreakable text can push "
    "children past their track and clip neighbours"
  )


def check_canvas_protection(html: str) -> tuple[bool, str]:
  """If the app embeds an interactive <canvas> in a scrolling layout
  (Chart.js, D3, Three.js, Leaflet, Pixi, Plotly, ECharts, Cesium, etc.),
  the canvas and its container MUST protect against the iOS text-selection
  magnifier loupe AND give the library clean access to touch gestures.

  Required on the canvas or its wrapper class:
    user-select: none  (or -webkit-user-select: none)
    -webkit-touch-callout: none
    touch-action: none            (so lib gets pinch/drag, not browser)

  See §3d in sebland-app/SKILL.md.

  Trigger heuristics (any match → require protection):
    - literal <canvas> tag in the HTML
    - known chart-lib names: chart.js, chartjs, chart-container, d3.js,
      three.js, pixi.js, leaflet, cesium, plotly, echarts
    - any CSS selector targeting `canvas`

  Skips for fullscreen canvas games (§3c) that already apply
  `touch-action: none` to html/body — different baseline.
  """
  # Skip for fullscreen canvas-game layout (§3c).
  fullscreen_game = bool(
    re.search(r"(html|body)[^{]*\{[^}]*touch-action\s*:\s*none", html, re.I)
    and re.search(r"(html|body)[^{]*\{[^}]*overflow\s*:\s*hidden", html, re.I)
  )
  if fullscreen_game:
    return True, "fullscreen canvas-game layout (§3c) — §3d rules don't apply"

  # Does the app use an interactive canvas?
  has_canvas_tag = bool(re.search(r"<canvas\b", html, re.I))
  chart_lib_keywords = (
    r"\bchart\.js\b|\bchartjs\b|\bchart-container\b|\bchart_container\b|"
    r"\bd3\.js\b|\bd3-(?:selection|scale|axis|zoom)\b|"
    r"\bthree(?:\.min)?\.js\b|\bTHREE\.\w+\b|"
    r"\bleaflet(?:\.js|\.css)?\b|\bL\.map\(|"
    r"\bpixi(?:\.min)?\.js\b|\bPIXI\.\w+\b|"
    r"\bcesium\.js\b|\bCesium\.\w+\b|"
    r"\bplotly\.js\b|\bPlotly\.\w+\b|"
    r"\becharts(?:\.min)?\.js\b|\bechartsInstance\b"
  )
  has_chart_keyword = bool(re.search(chart_lib_keywords, html, re.I))
  has_canvas_selector = bool(re.search(r"(?:^|[\s,{])canvas(?:\s|,|\{)", html, re.I))
  uses_canvas = has_canvas_tag or has_chart_keyword or has_canvas_selector

  if not uses_canvas:
    return True, "no interactive canvas/chart lib detected — skip"

  # Search rules whose selector touches canvas OR a container that
  # visibly holds the canvas. We accept both class names (.chart-container,
  # .map-wrap, etc.) AND ids (#map, #canvas-wrapper, #chart) because the
  # real-world naming varies and we don't want to force a rewrite.
  # Leaflet's own .leaflet-container counts too.
  # Also accept body/html rules if they set user-select: none — that
  # property inherits, so a blanket body rule covers child canvas elements.
  # (touch-action and -webkit-touch-callout do NOT reliably inherit, so
  # they still have to be on the canvas/container rule itself.)
  rules = re.findall(r"([^{}\n]+)\{([^}]+)\}", html, re.S)
  candidate_bodies: list[str] = []
  inherit_bodies: list[str] = []  # rules that only contribute inheritable props
  for selector, body in rules:
    sel = selector.strip()
    touches_canvas_or_container = re.search(
      r"\bcanvas\b|"
      r"\.chart-container\b|\.chart-canvas\b|\.chart-wrap\b|\.chart-body\b|"
      r"\.map-container\b|\.map-canvas\b|\.map-wrap\b|\.leaflet-container\b|"
      r"\.viz-container\b|\.viz-canvas\b|\.viz-wrap\b|"
      r"#map\b|#chart\b|#viz\b|#canvas-wrapper\b|#canvas-area\b",
      sel,
      re.I,
    )
    if touches_canvas_or_container:
      candidate_bodies.append(body)
      continue
    # html/body rules contribute ONLY inheritable properties.
    if re.search(r"(^|,)\s*(html|body)\s*(,|$|\s*\{)", sel + "{", re.I):
      inherit_bodies.append(body)

  if not candidate_bodies:
    return False, (
      "canvas/chart detected but no CSS rule targeting `canvas` or "
      "`.chart-container` etc. found — iOS magnifier will appear on "
      "long-press over the chart. See §3d."
    )

  combined = "\n".join(candidate_bodies)
  # user-select inherits, so an html/body rule counts for this property.
  # touch-action and -webkit-touch-callout do not inherit reliably, so
  # they still need to appear on the canvas/container rule itself.
  combined_with_inherit = combined + "\n" + "\n".join(inherit_bodies)
  has_user_select_none = bool(re.search(r"user-select\s*:\s*none", combined_with_inherit, re.I))
  has_touch_callout_none = bool(re.search(r"-webkit-touch-callout\s*:\s*none", combined, re.I))
  has_touch_action_none = bool(re.search(r"touch-action\s*:\s*none", combined, re.I))

  missing = []
  if not has_user_select_none:
    missing.append("user-select: none")
  if not has_touch_callout_none:
    missing.append("-webkit-touch-callout: none")
  if not has_touch_action_none:
    missing.append("touch-action: none")
  if missing:
    return False, (
      f"canvas/chart present but missing on canvas/container: "
      f"{', '.join(missing)}. iOS magnifier + gesture conflicts will "
      f"happen. See §3d."
    )
  return True, "canvas/chart has user-select, touch-callout, touch-action protections (§3d)"


def check_html_background(html: str) -> tuple[bool, str]:
  # Find any `html { ... background ... }` or `html, body { ... background ... }`
  # rule. Without this, iOS rubber-band overscroll exposes the white default,
  # AND viewport-fit=cover shows white bars in the safe-area zones.
  #
  # Accept any of: `background:`, `background-color:`, `background-image:`.
  # Reject `background: transparent` / `none` / `inherit` (those don't cover).
  #
  # Selector match is permissive — we scan all CSS rules and check if any
  # selector list contains `html` (as a bare keyword, not inside a pseudo).
  for m in re.finditer(r"([^{}]+)\{([^}]*)\}", html, re.S):
    selector, body = m.group(1).strip(), m.group(2)
    # Strip out comments and whitespace from selector for matching.
    sel_clean = re.sub(r"/\*.*?\*/", "", selector, flags=re.S).strip()
    # Must match `html` as a bare element selector (possibly with commas,
    # other selectors — e.g. `html, body { ... }`). Guard against `.html-*`
    # class names or attribute selectors.
    if not re.search(r"(^|,|\s)html(\s*,|\s*$|\s*\{|\s+)", sel_clean + " "):
      continue
    bg = re.search(r"\bbackground(-color|-image)?\s*:\s*([^;]+);?", body, re.I)
    if not bg:
      continue
    val = bg.group(2).strip().lower()
    if val in ("transparent", "none", "inherit", "unset", "initial"):
      continue
    return True, f"html has background set ({val[:40]}{'…' if len(val) > 40 else ''})"
  return False, (
    "html element has no background color — iOS rubber-band overscroll will "
    "flash white; and viewport-fit=cover will show white bars in safe-area zones. "
    "Add `html { background: <same-as-body>; }`"
  )


def check_safe_area_padding(html: str) -> tuple[bool, str]:
  # Only relevant if viewport-fit=cover is set. Otherwise the safe-area
  # zones are outside the viewport and don't matter.
  if not re.search(r"viewport-fit\s*=\s*cover", html, re.I):
    return True, "viewport-fit=cover not used — skip"
  # Look for env(safe-area-inset-*) anywhere in the stylesheet.
  # Typically on body padding, but could be on a layout wrapper.
  if re.search(r"env\s*\(\s*safe-area-inset-", html, re.I):
    return True, "env(safe-area-inset-*) is used — notched-device content protected"
  return False, (
    "viewport-fit=cover is set but no env(safe-area-inset-*) used — content near "
    "the top/bottom edges will be hidden behind iOS notch/home-indicator. "
    "Add `padding: env(safe-area-inset-top) ... env(safe-area-inset-bottom) ...` "
    "on body or a top-level wrapper."
  )


def check_wide_viewport_meta(html: str) -> tuple[bool, str]:
  # Extra credit: viewport-fit=cover + theme-color + apple-mobile-web-app-*
  # signals the author thought about standalone/iOS. Not a blocker.
  meta_count = sum(
    bool(re.search(p, html, re.I))
    for p in (
      r'viewport-fit=cover',
      r'apple-mobile-web-app-capable',
      r'apple-mobile-web-app-status-bar-style',
      r'theme-color',
    )
  )
  if meta_count >= 2:
    return True, f"iOS PWA hints present ({meta_count}/4)"
  return True, f"iOS PWA hints thin ({meta_count}/4) — optional, not a blocker"


CHECKS = [
  ("viewport has maximum-scale=1.0 + user-scalable=no", check_viewport),
  ("text-size-adjust: 100%", check_text_size_adjust),
  ("touch-action: manipulation on html/body", check_touch_action),
  ("inputs at font-size ≥ 16px", check_input_font_size),
  ("grid/flex children have min-width: 0", check_grid_min_width),
  ("canvas/chart protected against iOS magnifier + gesture conflicts (§3d)", check_canvas_protection),
  ("html element has a background color (no white bars/bounce flash)", check_html_background),
  ("safe-area padding when viewport-fit=cover", check_safe_area_padding),
  ("iOS PWA hints (optional)", check_wide_viewport_meta),
]


def main() -> None:
  if len(sys.argv) != 2:
    sys.exit("usage: check-mobile.py <file.html | url>")
  target = sys.argv[1]
  html = fetch(target)
  print(f"checking: {target}")
  print(f"size: {len(html):,} bytes\n")

  all_pass = True
  results = []
  for label, fn in CHECKS:
    ok, msg = fn(html)
    # Optional checks don't fail the overall run.
    is_optional = "optional" in label
    mark = "✓" if ok else ("⚠" if is_optional else "✗")
    if not ok and not is_optional:
      all_pass = False
    print(f"  {mark} {label}\n      {msg}")
    results.append((ok, label, msg))

  print()
  if all_pass:
    print("PASS — mobile baseline met")
    sys.exit(0)
  else:
    print("FAIL — fix the ✗ items above before declaring done")
    sys.exit(1)


if __name__ == "__main__":
  main()
