#!/usr/bin/env python3
"""
Generate Lanternfolk's static information and legal pages into public/.

The text describes what the shipped code actually does (verified 2026-11-16):
no accounts, no analytics, no cookies, no web storage written by the game,
no third-party requests observed; hand-tracking joints are used in memory only.
Update this file whenever data handling changes, then re-run it:

    python3 tools/build_pages.py
"""
import html
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, "public")
UPDATED = "16 November 2026"
EMAIL = "hello@hayaix.tech"
SITE = "lanternfolk.hayaix.tech"

PAGES = [
    ("about", "About"),
    ("support", "Support"),
    ("privacy", "Privacy Policy"),
    ("terms", "Terms of Service"),
    ("credits", "Credits &amp; Licenses"),
]

CSS = """
:root{--bg:#090a1f;--card:#12143a;--ink:#f4ecd8;--muted:#b9c1ef;--soft:#8790c4;--gold:#ffc861;--line:#262a5c}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--ink);font-family:"Trebuchet MS","Segoe UI",system-ui,sans-serif;line-height:1.6}
body{background:radial-gradient(1200px 600px at 20% -10%,#1d1f52 0%,transparent 60%),var(--bg)}
a{color:var(--gold)}a:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
header.top{display:flex;align-items:center;justify-content:space-between;gap:12px;max-width:820px;margin:0 auto;padding:18px 16px}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--ink);font-weight:700;font-size:20px}
.brand .dot{width:14px;height:14px;border-radius:50%;background:var(--gold);box-shadow:0 0 16px var(--gold)}
.play{background:var(--gold);color:#23183a;text-decoration:none;font-weight:700;padding:8px 16px;border-radius:999px;white-space:nowrap}
nav.tabs{max-width:820px;margin:0 auto;padding:0 16px;display:flex;flex-wrap:wrap;gap:6px 14px;font-size:14px}
nav.tabs a{color:var(--muted);text-decoration:none;padding:4px 0;border-bottom:2px solid transparent}
nav.tabs a[aria-current=page]{color:var(--ink);border-bottom-color:var(--gold)}
main{max-width:820px;margin:0 auto;padding:12px 16px 40px}
h1{font-size:clamp(28px,6vw,40px);margin:14px 0 4px;color:#ffe3a3}
h2{font-size:21px;margin:30px 0 8px;color:#ffe3a3}
h3{font-size:17px;margin:18px 0 6px}
p,li{color:var(--ink)}
.meta{color:var(--soft);font-size:14px;margin:0 0 16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 18px;margin:16px 0}
.card p:first-child{margin-top:0}.card p:last-child{margin-bottom:0}
table{border-collapse:collapse;width:100%;font-size:15px;display:block;overflow-x:auto}
th,td{border-bottom:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top}
th{color:var(--muted);font-weight:600}
code{background:#1b1e4a;padding:1px 6px;border-radius:6px;font-size:14px}
footer{max-width:820px;margin:0 auto;padding:22px 16px 40px;border-top:1px solid var(--line);color:var(--soft);font-size:14px}
footer nav{display:flex;flex-wrap:wrap;gap:6px 16px;margin-bottom:8px}
footer a{color:var(--muted)}
"""


def footer(current=""):
    links = " ".join(
        f'<a href="{pid}.html"{" aria-current=page" if pid == current else ""}>{label}</a>' for pid, label in PAGES
    )
    return f"""<footer>
  <nav aria-label="Site">{links}</nav>
  <p>Lanternfolk · a small independent WebXR game by Tho Nguyen · part of the <a href="https://hayaix.tech">HAYAiX</a> project showcase.
  Not affiliated with or endorsed by Meta.</p>
</footer>"""


def page(pid, title, body, lead=""):
    tabs = " ".join(
        f'<a href="{p}.html"{" aria-current=page" if p == pid else ""}>{label}</a>' for p, label in PAGES
    )
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.unescape(title)} · Lanternfolk</title>
<meta name="description" content="{html.unescape(title)} for Lanternfolk, a hands-first WebXR game for Meta Quest.">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ccircle cx='32' cy='32' r='14' fill='%23ffc861'/%3E%3C/svg%3E">
<link rel="stylesheet" href="site.css">
</head>
<body>
<header class="top">
  <a class="brand" href="./"><span class="dot" aria-hidden="true"></span>Lanternfolk</a>
  <a class="play" href="./">Play</a>
</header>
<nav class="tabs" aria-label="Pages">{tabs}</nav>
<main>
<h1>{title}</h1>
<p class="meta">Last updated: {UPDATED} · applies to Lanternfolk ({SITE}) only · English</p>
{lead}
{body}
</main>
{footer(pid)}
</body>
</html>
"""


MAIL = f'<a href="mailto:{EMAIL}">{EMAIL}</a>'

ABOUT = f"""
<div class="card"><p><strong>Lanternfolk</strong> is a short, peaceful VR game about helping tiny lost lantern spirits find their way home, using your own hands.</p></div>
<h2>The idea</h2>
<p>A miniature moonlit grove floats in front of you. Little spirits are asleep on islands that have drifted apart. Wake them with a touch,
hold your palm across a gap so they can walk over your hand, let one climb onto your palm and lift it up a cliff, and lay a glowing leaf
as a bridge for two friends. Every spirit you bring home makes the grove a little warmer: lanterns light up, flowers bloom and the music grows.
At the end the spirits gather beneath the great tree, and the first friend you helped comes over to say thank you.</p>
<p>The core idea: <em>your hands can become someone else's way home</em>. Lanternfolk is designed to be calm and comforting.
It is a relaxing entertainment experience, not a medical, therapeutic or wellness treatment, and it makes no health claims.</p>
<h2>How to play</h2>
<ul>
<li>Open <strong>{SITE}</strong> in the <strong>Meta Quest Browser</strong> and choose <strong>Enter VR</strong>.</li>
<li>Put your controllers down. Lanternfolk is played entirely with hand tracking: touch, an open palm, and a pinch.</li>
<li>Play seated. Everything is within a comfortable reach in front of you. A full playthrough takes about 3–5 minutes.</li>
<li>Touch the small moon-bell beside the grove to turn the music on or off.</li>
</ul>
<h2>Built with</h2>
<ul>
<li>WebXR with the Hand Input module, using Meta's open-source Immersive Web SDK (IWSDK) and Three.js.</li>
<li>All 3D scenery, characters, music and sound effects are generated by the game's own code. There are no downloaded art or audio assets.</li>
<li>Developed and tested with the Immersive Web Emulator. See <a href="support.html">Support</a> for known limitations.</li>
</ul>
<h2>Who made it</h2>
<p>Lanternfolk is a personal project by <strong>Tho Nguyen</strong>, an independent developer in Japan, and is part of the
<a href="https://hayaix.tech">HAYAiX</a> project showcase. It was created in November 2026 as an entry to the
Meta VR Start Developer Competition 2026 (Gaming track). It is not affiliated with or endorsed by Meta.</p>
<p>Contact: {MAIL}</p>
"""

SUPPORT = f"""
<h2>Contact</h2>
<p>For help, feedback, bug reports or privacy questions, email {MAIL}. Please mention <em>Lanternfolk</em> and, if relevant,
your headset model and Quest Browser version. Lanternfolk is a free personal project, so replies may take a few days.</p>
<h2>Quick fixes</h2>
<h3>"Immersive VR is not available here"</h3>
<p>Open the page in the <strong>Meta Quest Browser</strong> on a Meta Quest headset. Desktop and phone browsers show a preview only.</p>
<h3>My hands are not detected</h3>
<p>Put your controllers down and wait a moment. Make sure hand tracking is turned on in your headset's settings
(on Meta Quest it is under the movement and hand-tracking settings). Good, even lighting helps tracking.</p>
<h3>The grove is in an awkward place</h3>
<p>Sit comfortably, look straight ahead and use your headset's recenter gesture or button. The grove moves to about an arm's length in front of you.</p>
<h3>A spirit will not cross my hand</h3>
<p>Hold your hand flat and still across the gap, at about the height of the path. A loose, open hand works best. If your hand moves away,
the spirit simply floats back to safety and waits for you to try again.</p>
<h3>I can't hear anything</h3>
<p>Check the headset volume, then touch the small moon-bell beside the grove: it toggles the music. Sound starts after you press <em>Enter VR</em>.</p>
<h2>Known limitations</h2>
<ul>
<li>Lanternfolk was developed and tested in the Immersive Web Emulator. It has not yet been tested by the developer on a physical Meta Quest headset,
so hand-tracking feel and performance on real hardware may differ.</li>
<li>Hand tracking is required. Controllers may be visible, but the puzzles are designed for hands.</li>
<li>There is no save system: each visit is a complete 3–5 minute session.</li>
</ul>
"""

PRIVACY_SUMMARY = """
<div class="card">
<p><strong>In short:</strong> Lanternfolk has no accounts, no analytics, no advertising and no cookies. The game does not store anything on your device
and does not send anything about you anywhere. Your hand-tracking data is used only in your headset's memory, frame by frame, to run the game, and it is
never saved or transmitted. Like every website, the hosting provider processes basic connection data (such as your IP address) to deliver the files.</p>
</div>
"""

PRIVACY = f"""
<h2>1. Who is responsible</h2>
<p>Lanternfolk ({SITE}) is a free personal project by Tho Nguyen ("I", "me"), an independent developer in Japan. Contact: {MAIL}.
This policy covers Lanternfolk only. The <a href="https://hayaix.tech">HAYAiX</a> showcase and other projects have their own documents.</p>
<h2>2. Hand tracking and headset data</h2>
<ul>
<li>When you enter VR, the game asks your browser for WebXR hand tracking. If you allow it, your browser provides the positions of 25 points (joints)
on each hand, many times per second.</li>
<li>Lanternfolk uses these positions only to run the gameplay on your device: detecting a touch, a pinch, or an open palm the spirits can walk on.
The joint data is kept in memory for the current frame only. It is <strong>never stored, recorded, uploaded or shared</strong>.</li>
<li>The game also uses the headset's position and direction to place the grove in front of you. This data is also used in memory only.</li>
<li>Lanternfolk does not use the camera, passthrough images, microphone, eye tracking, location or contacts.</li>
</ul>
<h2>3. What is not collected</h2>
<p>There are no user accounts, forms, analytics, advertising, tracking pixels, crash reporting or fingerprinting. The game does not set cookies and does not
write to local storage, session storage or IndexedDB. (The Immersive Web SDK contains code that can save spatial-anchor IDs in local storage, but that
feature is switched off in Lanternfolk.) Your browser may keep its normal cache of the site's files, which you can clear in the browser settings.</p>
<h2>4. Hosting</h2>
<p>The site is static files hosted on Amazon Web Services (Amazon S3 with Amazon CloudFront). To deliver the files, AWS necessarily processes connection
data such as your IP address, browser user agent and the requested URL, as described in the
<a href="https://aws.amazon.com/privacy/" rel="noopener noreferrer">AWS Privacy Notice</a>. I have not enabled access logging on the Lanternfolk
CloudFront distribution or S3 bucket, so I do not receive logs of individual visits.</p>
<h2>5. Third-party requests</h2>
<p>In my testing, the game loads files only from {SITE}. The Immersive Web SDK contains code that can download 3D controller models from the public
<a href="https://www.jsdelivr.com/terms/privacy-policy-jsdelivr-net" rel="noopener noreferrer">jsDelivr</a> CDN for some controller types.
I did not observe this request in testing, but if it happens, jsDelivr receives your IP address and browser details.</p>
<h2>6. Email</h2>
<p>If you email me, I use your email address and message only to reply and to fix problems you report. I keep them as long as needed for that purpose and
delete them on request.</p>
<h2>7. Children</h2>
<p>Lanternfolk contains no violence and no user-generated content, and it collects no personal data. Meta Quest headsets and accounts have their own
age requirements, set by Meta. Please follow them and use VR under adult supervision where required.</p>
<h2>8. Your rights</h2>
<p>Because the game collects no personal data, there is normally nothing to access or delete. For any privacy question or request, including under Japan's
Act on the Protection of Personal Information or the laws of your country, email {MAIL}.</p>
<h2>9. Platform</h2>
<p>Your headset, Meta account and the Meta Quest Browser are provided by Meta under Meta's own terms and privacy policy. Lanternfolk does not receive data
from your Meta account.</p>
<h2>10. Changes</h2>
<p>If the way Lanternfolk handles data changes, I will update this page and its "Last updated" date before the change goes live.</p>
"""

TERMS = f"""
<p>These terms explain the conditions for using Lanternfolk ({SITE}), a free, non-commercial game by Tho Nguyen ("I", "me").
By opening or playing Lanternfolk you agree to these terms and the <a href="privacy.html">Privacy Policy</a>. If you do not agree, please do not use it.</p>
<h2>1. What Lanternfolk is</h2>
<ul>
<li>A short VR game played in a web browser with hand tracking. It is provided free of charge, <strong>"as is"</strong> and <strong>"as available"</strong>.</li>
<li>It is a relaxing entertainment experience. It is <strong>not</strong> a medical device, therapy or treatment, and it makes no health or wellness claims.</li>
</ul>
<h2>2. Play safely</h2>
<ul>
<li>Play seated in a safe, clear space, and follow the health and safety warnings for your headset.</li>
<li>Take a break, or stop, if you feel discomfort, eye strain, dizziness or nausea.</li>
<li>Supervise children according to your headset's age requirements.</li>
</ul>
<h2>3. Permitted use</h2>
<p>You may play, record and share videos or screenshots of Lanternfolk for personal, review, educational and non-commercial purposes, and judges may
evaluate it for competitions. Please do not attack, overload or tamper with the site, or redistribute its code or content as your own.</p>
<h2>4. Intellectual property</h2>
<ul>
<li>Lanternfolk's game code, design, procedural scenery, music and sound are © 2026 Tho Nguyen. All rights reserved, except where stated otherwise.</li>
<li>Open-source libraries keep their own licenses. See <a href="credits.html">Credits &amp; Licenses</a>.</li>
<li>Meta, Meta Quest and related marks are trademarks of Meta Platforms, Inc. Lanternfolk is not affiliated with or endorsed by Meta.</li>
</ul>
<h2>5. No warranties</h2>
<p>To the extent permitted by law, I make no promises about Lanternfolk's availability, accuracy, compatibility with any device, or uninterrupted or
error-free operation. It may change or stop being available at any time.</p>
<h2>6. Limitation of liability</h2>
<p>To the extent permitted by law, I am not responsible for loss or damage arising from using or being unable to use Lanternfolk, including injury or damage
caused by not following your headset's safety guidance. <strong>Nothing in these terms excludes or limits liability that cannot be excluded or limited under
applicable law</strong>, including under the laws of Japan such as the Consumer Contract Act, and liability for intentional misconduct or gross negligence.
If any part of these terms is invalid, the rest stays in effect.</p>
<h2>7. Changes</h2>
<p>I may update these terms. The "Last updated" date shows the current version. If you keep using Lanternfolk after a change, the updated terms apply.</p>
<h2>8. Governing law</h2>
<p>These terms are governed by the laws of Japan. This does not take away any protection you have under the mandatory consumer laws of the country where you live.</p>
<h2>9. Contact</h2>
<p>{MAIL}</p>
"""

CREDITS = f"""
<h2>Made by</h2>
<p>Design, code, procedural art, music and sound: <strong>Tho Nguyen</strong>.</p>
<h2>Original content</h2>
<ul>
<li><strong>3D scenery and characters:</strong> generated at runtime by the game's own code (low-poly geometry). No 3D model files are used.</li>
<li><strong>Music:</strong> "Moonlit Grove", an original generative score (66 BPM, piano, music box, pads and glass bells) synthesized live with the Web Audio API.</li>
<li><strong>Sound effects and ambience:</strong> wind, leaves, fireflies, footsteps and chimes, all synthesized in code. No audio files are used.</li>
<li><strong>Fonts:</strong> none are shipped. Text uses your device's system fonts.</li>
<li><strong>AI:</strong> development was assisted by AI coding tools. The game contains no AI-generated images, music or video.
The narration in the demo video uses a synthetic voice (Kokoro TTS, open-weight model, Apache License 2.0).</li>
</ul>
<h2>Open-source software in the game</h2>
<table>
<thead><tr><th>Software</th><th>Version</th><th>License</th></tr></thead>
<tbody>
<tr><td>Immersive Web SDK (<code>@iwsdk/core</code>, <code>@iwsdk/xr-input</code>, <code>@iwsdk/locomotor</code>), Meta Platforms, Inc.</td><td>1.1.0</td><td>MIT</td></tr>
<tr><td>three.js (via <code>super-three</code>)</td><td>0.185.0</td><td>MIT</td></tr>
<tr><td>EliCS (entity-component system)</td><td>3.4.2</td><td>MIT</td></tr>
<tr><td>@preact/signals-core</td><td>1.14.5</td><td>MIT</td></tr>
<tr><td>pmndrs uikit, uikit-horizon, uikit-lucide, handle, pointer-events (bundled by the SDK)</td><td>1.0.78 / 6.6.32</td><td>MIT</td></tr>
<tr><td>Lucide icons (bundled via uikit-lucide; not displayed)</td><td>—</td><td>ISC</td></tr>
</tbody>
</table>
<h2>Development tools (not shipped)</h2>
<table>
<thead><tr><th>Tool</th><th>License</th></tr></thead>
<tbody>
<tr><td>Immersive Web Emulator (IWER) and IWSDK CLI / Vite plugin</td><td>MIT</td></tr>
<tr><td>Vite</td><td>MIT</td></tr>
<tr><td>TypeScript</td><td>Apache-2.0</td></tr>
<tr><td>Vitest</td><td>MIT</td></tr>
<tr><td>Meta VR CLI (<code>@meta-quest/metavr</code>, installed by the IWSDK starter)</td><td>Meta Platform Technologies SDK License</td></tr>
</tbody>
</table>
<p>The full MIT and Apache-2.0 license texts are available from each project's repository. Thank you to everyone who builds and maintains these projects.</p>
"""


def main():
    open(os.path.join(PUBLIC, "site.css"), "w").write(CSS.strip() + "\n")
    content = {
        "about": ("About Lanternfolk", ABOUT, ""),
        "support": ("Support &amp; Contact", SUPPORT, ""),
        "privacy": ("Privacy Policy", PRIVACY, PRIVACY_SUMMARY),
        "terms": ("Terms of Service", TERMS, ""),
        "credits": ("Credits &amp; Licenses", CREDITS, ""),
    }
    for pid, (title, body, lead) in content.items():
        open(os.path.join(PUBLIC, f"{pid}.html"), "w").write(page(pid, title, body, lead))
    print("wrote", ", ".join(f"{p}.html" for p in content), "+ site.css")


if __name__ == "__main__":
    main()
