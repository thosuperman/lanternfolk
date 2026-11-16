#!/usr/bin/env python3
"""
End-to-end playtest in the IWER emulator (no headset needed).

Drives emulated hand-tracking input through the IWSDK CLI and reads game state
from window.lanternfolk. Requires `npx iwsdk dev up --allow-browser-automation`.

Usage: python3 tools/playtest.py [--shots DIR] [--from LEVEL]
"""
import argparse
import json
import os
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def cli(*args, payload=None, timeout=90, tries=4):
    for i in range(tries):
        try:
            return _cli(*args, payload=payload, timeout=timeout)
        except RuntimeError as e:
            if "queue" not in str(e) or i == tries - 1:
                raise
            time.sleep(0.5)


def _cli(*args, payload=None, timeout=90):
    cmd = ["npx", "iwsdk", *args]
    if payload is not None:
        cmd += ["--input-json", json.dumps(payload)]
    out = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=timeout)
    if not out.stdout.strip() or '"ok": false' in out.stdout[:40]:
        m = out.stdout + out.stderr
        i = m.find('"message"')
        raise RuntimeError(m[i:i + 400] if i >= 0 else m[-600:])
    try:
        return json.loads(out.stdout)
    except json.JSONDecodeError:
        # browser run prints the value on the first line, then the envelope
        lines = out.stdout.strip().splitlines()
        for i in range(len(lines)):
            try:
                return json.loads("\n".join(lines[i:]))
            except json.JSONDecodeError:
                continue
        raise RuntimeError(out.stdout + out.stderr)


def ev(expr, tries=4):
    for i in range(tries):
        try:
            return _ev(expr)
        except RuntimeError as e:
            if "queue" not in str(e) or i == tries - 1:
                raise
            time.sleep(0.5)


def _ev(expr):
    env = dict(os.environ, EXPR=expr)
    out = subprocess.run(["npx", "iwsdk", "browser", "run", "tools/eval.mjs"], cwd=ROOT,
                         capture_output=True, text=True, env=env, timeout=60)
    if not out.stdout.strip():
        raise RuntimeError("eval failed: " + (out.stderr or "")[-400:])
    first = out.stdout.strip().splitlines()[0]
    if first.startswith("{") and '"ok": false' in out.stdout:
        raise RuntimeError("eval failed: " + out.stdout[:400])
    return json.loads(first)


SEQ_OPTS = {}


def seq(steps, device="hand-right"):
    r = cli("xr", "run-sequence", "--timeout", "60000", payload={"device": device, "steps": steps, **SEQ_OPTS}, timeout=120)
    if not r.get("ok"):
        raise RuntimeError(r.get("error", {}).get("message", json.dumps(r)[:600]))
    return r["data"]["result"]


def shot(path):
    if path:
        cli("browser", "screenshot", "--output-file", path)


def state():
    return ev("({phase: lanternfolk.phase, level: lanternfolk.level, folk: lanternfolk.folk})")


def wait_for(pred, timeout=20.0, label=""):
    t0 = time.time()
    while time.time() - t0 < timeout:
        s = state()
        if pred(s):
            return s
        time.sleep(0.5)
    raise AssertionError(f"timeout waiting for {label}: {json.dumps(state())}")


def P(v, dx=0.0, dy=0.0, dz=0.0):
    return {"x": v[0] + dx, "y": v[1] + dy, "z": v[2] + dz}


def rest(device="hand-right"):
    x = 0.22 if device == "hand-right" else -0.22
    seq([{"label": "rest", "position": {"x": x, "y": 0.75, "z": -0.15}, "anchor": "wrist", "poseId": "default", "duration": 0.5}], device)


def poke(target):
    seq([
        {"label": "approach", "position": P(target, dz=0.06, dy=0.03), "anchor": "index-tip", "poseId": "point", "duration": 0.7},
        {"label": "touch", "position": P(target), "anchor": "index-tip", "duration": 0.4},
        {"label": "hold", "duration": 0.05},
        {"label": "lift", "position": P(target, dy=0.12, dz=0.08), "anchor": "index-tip", "duration": 0.5},
    ])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shots", default="")
    ap.add_argument("--from", dest="start", type=int, default=0)
    args = ap.parse_args()
    shots = args.shots
    if shots:
        os.makedirs(shots, exist_ok=True)
    sp = lambda n: os.path.join(shots, n) if shots else ""

    st = cli("xr", "status")
    if not st["data"]["result"].get("sessionActive", st["data"]["result"].get("active")):
        cli("xr", "enter")
        time.sleep(1.5)
    cli("xr", "set-input-mode", payload={"mode": "hand"})
    cli("xr", "set-transform", payload={"device": "headset", "position": {"x": 0, "y": 1.2, "z": 0}})
    time.sleep(0.3)
    ev("lanternfolk.recenter()")
    ev(f"lanternfolk.skipTo({args.start})")
    cli("xr", "look-at", payload={"device": "headset", "target": {"x": 0, "y": 0.86, "z": -0.45}})
    rest("hand-left")
    rest()
    results = []

    def check(name, ok, detail=""):
        results.append((name, ok, detail))
        print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""), flush=True)

    t = ev("lanternfolk.targets")

    if args.start <= 0:
        shot(sp("01_intro.png"))
        poke(t["folk1a"])
        s = wait_for(lambda s: s["folk"][0]["help"] == "bridge", 15, "folk1 waits at gap")
        check("L1 poke wakes folk, it walks to the gap and asks for help", True)
        shot(sp("02_wait_bridge.png"))
        h = t["hint1"]
        flat = {"fingers": [-1, 0, 0], "palm": "up"}
        # Robustness, deterministic: an in-page watcher (started *before* the hand arrives) waits
        # until the spirit steps onto the hand, then simulates tracking loss in the game's input
        # layer and records what follows. XR CLI commands run alongside browser scripts.
        import threading
        box = {}
        watcher = threading.Thread(target=lambda: box.update(trace=ev("""(async () => {
          const F = () => lanternfolk.folk[0];
          const t0 = performance.now();
          while (F().state !== 'bridge' && performance.now() - t0 < 12000) await new Promise(r => setTimeout(r, 10));
          const onHand = F().state;
          // wait until it is ~3 cm out over the gap (past the solid edge, far from the other side)
          const inner = __lf.zones[0].folk[0];
          while (inner.s < 0.03 && performance.now() - t0 < 15000) await new Promise(r => setTimeout(r, 5));
          lanternfolk.simulateTrackingLoss(5);
          await new Promise(r => setTimeout(r, 700));
          const during = F().state;
          await new Promise(r => setTimeout(r, 3800));
          return [onHand, during, F().state];
        })()""")))
        watcher.start()
        time.sleep(2.0)  # let the watcher start before the hand moves
        seq([{"label": "bridge", "position": P(h, dy=0.0), "anchor": "grasp", "poseId": "flat", "orientation": flat, "duration": 1.0}])
        watcher.join(timeout=30)
        trace = box.get("trace", ["?", "?", "?"])
        check("L1 spirit steps onto the hand after a short hesitation", trace[0] == "bridge", trace[0])
        check("L1 tracking lost mid-crossing: spirit hovers instead of falling", trace[1] == "hover", trace[1])
        check("L1 ...then drifts back to the edge and waits (progress kept)", trace[2] == "wait", trace[2])
        time.sleep(1.0)
        seq([{"label": "bridge-again", "position": P(h, dy=0.0), "anchor": "grasp", "poseId": "flat", "orientation": flat, "duration": 1.0}])
        time.sleep(1.2)
        shot(sp("03_on_hand.png"))
        s = wait_for(lambda s: s["folk"][0]["state"] == "seated", 20, "folk1 seated")
        check("L1 folk crosses the hand bridge and reaches the tree", True)
        rest()
        wait_for(lambda s: s["level"] == 1 and s["phase"] == "play", 15, "level 2 starts")
        check("L1 -> L2 transition", True)
        time.sleep(0.5)
        t = ev("lanternfolk.targets")

    if args.start <= 1:
        shot(sp("04_level2.png"))
        poke(t["folk2a"])
        wait_for(lambda s: s["folk"][1]["help"] == "lift", 15, "folk2 waits for lift")
        check("L2 folk asks for a lift", True)
        h, h2 = t["hint2"], t["hintTo2"]
        seq([
            {"label": "offer", "position": P(h, dy=0.05), "anchor": "grasp", "poseId": "flat",
             "orientation": {"fingers": [-1, 0, 0], "palm": "up"}, "duration": 1.0},
            {"label": "wait", "duration": 1.0},
        ])
        s = state()
        check("L2 folk boards the palm", s["folk"][1]["state"] in ("hop-on", "ride"), s["folk"][1]["state"])
        # Robustness: tracking lost mid-ride.
        cli("xr", "set-connected", payload={"device": "hand-right", "connected": False})
        s = wait_for(lambda s: s["folk"][1]["state"] in ("return", "wait"), 6, "float back on tracking loss")
        check("L2 tracking lost mid-ride: spirit floats safely back to a pad", True, s["folk"][1]["state"])
        cli("xr", "set-connected", payload={"device": "hand-right", "connected": True})
        s = wait_for(lambda s: s["folk"][1]["state"] in ("wait", "hop-on", "ride"), 6, "waiting again")
        if s["folk"][1]["state"] == "wait":
          seq([{"label": "offer-again", "position": P(h, dy=0.05), "anchor": "grasp", "poseId": "flat",
              "orientation": {"fingers": [-1, 0, 0], "palm": "up"}, "duration": 1.0}, {"label": "wait", "duration": 1.2}])
        s = wait_for(lambda s: s["folk"][1]["state"] in ("hop-on", "ride"), 5, "re-board")
        check("L2 tracking reacquired: spirit boards again", True)
        seq([{"label": "raise", "position": P(h, dy=0.09, dz=0.01), "anchor": "grasp", "duration": 1.0}])
        shot(sp("05_riding.png"))
        seq([{"label": "to-ledge", "position": P(h2, dy=0.03), "anchor": "grasp", "duration": 1.2}, {"label": "hold", "duration": 1.0}])
        s = wait_for(lambda s: s["folk"][1]["state"] in ("walk", "seated"), 10, "folk2 steps off")
        check("L2 folk rides the hand up and steps off at the ledge", True)
        rest()
        wait_for(lambda s: s["folk"][1]["state"] == "seated", 15, "folk2 seated")
        wait_for(lambda s: s["level"] == 2 and s["phase"] == "play", 15, "level 3 starts")
        check("L2 -> L3 transition", True)
        time.sleep(0.5)
        t = ev("lanternfolk.targets")

    if args.start <= 2:
        shot(sp("06_level3.png"))
        poke(t["folk3a"])
        poke(t["folk3b"])
        wait_for(lambda s: s["folk"][2]["help"] == "leaf", 15, "folk3a waits for leaf")
        check("L3 both folk wake; they ask for the leaf bridge", True)
        t = ev("lanternfolk.targets")
        leaf, slot = t["leaf"], t["leafSlot"]
        seq([
            {"label": "grab", "position": P(leaf), "anchor": "grasp", "approach": {"distance": 0.05}, "pinch": {"value": 1, "at": "arrival"}, "duration": 1.0},
            {"label": "carry", "position": P(slot, dy=0.01), "anchor": "grasp", "duration": 1.2},
        ])
        shot(sp("07_carry_leaf.png"))
        seq([{"label": "release", "pinch": 0, "duration": 0.2}, {"label": "away", "position": P(slot, dy=0.12, dz=0.1), "anchor": "grasp", "duration": 0.6}])
        placed = ev("lanternfolk.folk[2].help === null || lanternfolk.folk[2].state === 'bridge'")
        check("L3 pinch-carried leaf snaps into the gap", bool(placed))
        rest()
        wait_for(lambda s: s["folk"][2]["state"] == "seated" and s["folk"][3]["state"] == "seated", 25, "both seated")
        check("L3 both folk cross the leaf and reach the tree", True)
        wait_for(lambda s: s["phase"] == "star", 10, "star phase")
        t = ev("lanternfolk.targets")

    shot(sp("08_star.png"))
    star, sock = t["star"], t["socket"]
    seq([
        {"label": "grab", "position": P(star), "anchor": "grasp", "approach": {"distance": 0.05}, "pinch": {"value": 1, "at": "arrival"}, "duration": 1.0},
        {"label": "carry", "position": P(sock, dy=0.01), "anchor": "grasp", "duration": 1.4},
        {"label": "release", "pinch": 0, "duration": 0.2},
        {"label": "away", "position": P(sock, dy=0.05, dz=0.15), "duration": 0.6},
    ])
    wait_for(lambda s: s["phase"] in ("finale", "ending"), 6, "finale")
    check("Finale: star placed on the tree", True)
    time.sleep(8)
    s = state()
    gathered = [f["state"] for f in s["folk"]]
    check("Finale: rescued spirits gather; first friend comes to thank you",
          all(g in ("gather", "thank") for g in gathered) and "thank" in gathered, ",".join(gathered))
    rest()
    time.sleep(3.5)
    shot(sp("09_finale.png"))
    wait_for(lambda s: s["phase"] == "ending", 12, "ending")
    t = ev("lanternfolk.targets")
    shot(sp("10_ending.png"))
    time.sleep(1.2)
    # Music bell (hands-only mute toggle)
    before = ev("lanternfolk.musicMuted")
    poke(t["bell"])
    time.sleep(0.4)
    after = ev("lanternfolk.musicMuted")
    check("Music bell toggles music with a touch", before != after, f"{before}->{after}")
    poke(t["bell"])
    rest()
    poke(t["replay"])
    wait_for(lambda s: s["phase"] in ("transition", "play", "intro") and s["level"] == 0, 8, "replay")
    check("Ending: touching the lantern restarts the game", ev("lanternfolk.rescued") == 0)
    rest()

    fails = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(fails)}/{len(results)} checks passed")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
