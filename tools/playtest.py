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
        {"label": "hold", "duration": 0.3},
        {"label": "lift", "position": P(target, dy=0.12, dz=0.08), "anchor": "index-tip", "duration": 0.5},
    ])


FLAT = {"fingers": [-1, 0, 0], "palm": "up"}
PALM = "middle-finger-metacarpal"  # anchor roughly at the palm centre


def palm_at(target, dy=0.0, duration=1.0, label="palm", **extra):
    return {"label": label, "position": P(target, dy=dy), "anchor": PALM, "poseId": "flat", "orientation": FLAT, "duration": duration, **extra}


def detour(frm, to, branch, up=0.12):
    """Waypoints that lift up beside the pad (away from the branch), cross over high, then descend."""
    ax, az = frm[0] - branch[0], frm[2] - branch[2]
    n = (ax * ax + az * az) ** 0.5 or 1.0
    side = [frm[0] + ax / n * 0.035, frm[1] + up, frm[2] + az / n * 0.035]
    over = [to[0], max(frm[1] + up, to[1] + 0.07), to[2]]
    return [
        palm_at(side, duration=1.6, label="up"),
        palm_at(over, duration=1.8, label="over"),
        palm_at(to, dy=-0.01, duration=1.2, label="down"),
        {"label": "hold", "duration": 0.8},
    ]


def f(i):
    return state()["folk"][i]


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
    if not st["data"]["result"].get("sessionActive"):
        cli("xr", "enter")
        time.sleep(1.5)
    cli("xr", "set-input-mode", payload={"mode": "hand"})
    cli("xr", "set-transform", payload={"device": "headset", "position": {"x": 0, "y": 1.6, "z": 0}, "orientation": {"pitch": -28, "yaw": 0, "roll": 0}})
    time.sleep(0.3)
    ev("lanternfolk.recenter()")
    ev(f"lanternfolk.skipTo({args.start})")
    rest("hand-left")
    rest()
    results = []

    def check(name, ok, detail=""):
        results.append((name, ok, detail))
        print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""), flush=True)

    t = ev("lanternfolk.targets")

    # ------------------------------------------------------------ Chapter 1
    if args.start <= 0:
        shot(sp("01_intro.png"))
        poke(t["folk1a"])
        wait_for(lambda s: s["folk"][0]["help"] == "bridge" and s["folk"][0]["seg"] == 1, 20, "first gap")
        check("Ch1 touch wakes the shy spirit; it walks to the first gap and asks for help", True)
        shot(sp("02_first_gap.png"))
        seq([palm_at(t["bridge1_0"], dy=-0.02), {"label": "hold", "duration": 0.5}])
        wait_for(lambda s: s["folk"][0]["seg"] >= 2, 15, "crossed gap 1")
        check("Ch1 it crosses the first gap on a flat palm", True)
        rest()
        wait_for(lambda s: s["folk"][0]["help"] == "bridge" and s["folk"][0]["seg"] == 3, 20, "second gap")
        # Failure: tip the palm steeply while it is crossing -> it slips back to the checkpoint.
        # Failure: offer a steeply tilted palm (on its side). The spirit steps onto it, wobbles and slips.
        tilted = palm_at(t["bridge1_1"], dy=-0.02)
        tilted["orientation"] = {"fingers": [-1, 0, 0], "palm": "forward"}
        seq([tilted])
        ev("""(async () => { const F = __lf.zones[0].folk[0]; const t0 = performance.now();
          while (F.slips < 1 && performance.now() - t0 < 8000) await new Promise(r => setTimeout(r, 10)); return F.slips; })()""")
        cli("xr", "set-transform", payload={"device": "hand-right", "anchor": "wrist", "position": {"x": 0.22, "y": 0.75, "z": -0.15}})
        s = wait_for(lambda s: s["folk"][0]["slips"] >= 1, 6, "slip")
        check("Ch1 failure: tipping the palm makes the spirit lose balance", True, f"slips={s['folk'][0]['slips']}")
        rest()
        s = wait_for(lambda s: s["folk"][0]["state"] == "wait" and s["folk"][0]["seg"] == 3, 8, "back at checkpoint")
        check("Ch1 ...it floats back to its checkpoint (same gap), dizzy but fine", True, s["folk"][0]["emotion"])
        time.sleep(1.5)
        seq([palm_at(t["bridge1_1"], dy=-0.02), {"label": "hold", "duration": 0.5}])
        s = wait_for(lambda s: s["folk"][0]["state"] == "seated", 25, "home")
        check("Ch1 retry: steady palm, it crosses the wide gap and reaches the tree", True)
        rest()
        wait_for(lambda s: s["level"] == 1 and s["phase"] == "play", 15, "chapter 2")
        check("Ch1 -> Ch2 transition", True)
        time.sleep(3.5)  # chapter card
        t = ev("lanternfolk.targets")

    # ------------------------------------------------------------ Chapter 2
    if args.start <= 1:
        shot(sp("03_ch2.png"))
        poke(t["folk2a"])
        wait_for(lambda s: s["folk"][1]["help"] == "lift" and s["folk"][1]["seg"] == 1, 20, "lift 1")
        check("Ch2 the playful spirit asks for a lift", True)
        seq([palm_at(t["lift2_0"], dy=-0.005), {"label": "hold", "duration": 1.2}])
        s = wait_for(lambda s: s["folk"][1]["state"] == "ride", 6, "board")
        check("Ch2 it climbs onto the palm", True)
        # Failure 1: a fast flick makes it lose balance.
        seq([
            palm_at(t["lift2_0"], dy=0.16, duration=0.15, label="shake-up"),
            palm_at(t["lift2_0"], dy=0.02, duration=0.15, label="shake-down"),
            palm_at(t["lift2_0"], dy=0.16, duration=0.15, label="shake-up2"),
            {"label": "hold", "duration": 0.6},
        ])
        s = wait_for(lambda s: s["folk"][1]["slips"] >= 1, 5, "flick slip")
        check("Ch2 failure: shaking the hand makes it slip back", True, s["folk"][1]["emotion"])
        rest()
        wait_for(lambda s: s["folk"][1]["state"] == "wait" and s["folk"][1]["seg"] == 1, 8, "back on pad")
        time.sleep(1.6)
        # Failure 2: carrying it into a swinging branch.
        t = ev("lanternfolk.targets")
        seq([palm_at(t["lift2_0"], dy=-0.005), {"label": "hold", "duration": 1.2}])
        wait_for(lambda s: s["folk"][1]["state"] == "ride", 6, "board again")
        t = ev("lanternfolk.targets")
        seq([palm_at(t["branchRest0"], dy=-0.045, duration=0.9, label="into-branch"), {"label": "hold", "duration": 2.8}])
        s = wait_for(lambda s: s["folk"][1]["slips"] >= 2, 5, "branch bump")
        check("Ch2 failure: bumping a swinging branch knocks it back to the pad", True, s["folk"][1]["state"])
        rest()
        wait_for(lambda s: s["folk"][1]["state"] == "wait" and s["folk"][1]["seg"] == 1, 8, "pad again")
        time.sleep(1.6)
        # Success: up beside the pad, over the branch, down onto the ledge; then again to the top.
        t = ev("lanternfolk.targets")
        seq([palm_at(t["lift2_0"], dy=-0.005), {"label": "hold", "duration": 1.2}])
        wait_for(lambda s: s["folk"][1]["state"] == "ride", 6, "board 3")
        t = ev("lanternfolk.targets")
        seq(detour(t["lift2_0"], t["liftTo2_0"], t["branchRest0"]))
        s = wait_for(lambda s: s["folk"][1]["seg"] >= 2, 6, "mid ledge")
        check("Ch2 lifted up and over the branch onto the middle ledge (checkpoint)", True)
        rest()
        wait_for(lambda s: s["folk"][1]["help"] == "lift" and s["folk"][1]["seg"] == 3, 12, "lift 2")
        t = ev("lanternfolk.targets")
        seq([palm_at(t["lift2_1"], dy=-0.005), {"label": "hold", "duration": 1.2}])
        wait_for(lambda s: s["folk"][1]["state"] == "ride", 6, "board 4")
        t = ev("lanternfolk.targets")
        seq(detour(t["lift2_1"], t["liftTo2_1"], t["branchRest1"], up=0.1))
        s = wait_for(lambda s: s["folk"][1]["seg"] >= 4 or s["folk"][1]["state"] == "seated", 8, "top")
        check("Ch2 second lift past the other branch to the top", True)
        rest()
        wait_for(lambda s: s["folk"][1]["state"] == "seated", 15, "home 2")
        wait_for(lambda s: s["level"] == 2 and s["phase"] == "play", 15, "chapter 3")
        check("Ch2 -> Ch3 transition", True)
        time.sleep(3.5)
        t = ev("lanternfolk.targets")

    # ------------------------------------------------------------ Chapter 3
    if args.start <= 2:
        shot(sp("04_ch3.png"))
        poke(t["folk3a"])
        poke(t["folk3b"])
        wait_for(lambda s: s["folk"][2]["help"] == "leaf", 20, "leaf needed")
        check("Ch3 both spirits wake; they ask for the leaf bridge", True)
        t = ev("lanternfolk.targets")
        leaf, slot = t["leaf"], t["leafSlot"]
        seq([
            {"label": "grab", "position": P(leaf), "anchor": "grasp", "approach": {"distance": 0.05}, "pinch": {"value": 1, "at": "arrival"}, "duration": 1.0},
            {"label": "carry", "position": P(slot, dy=0.01), "anchor": "grasp", "duration": 1.2},
            {"label": "release", "pinch": 0, "duration": 0.2},
            {"label": "away", "position": P(slot, dy=0.12, dz=0.1), "anchor": "grasp", "duration": 0.6},
        ])
        rest()
        wait_for(lambda s: s["folk"][2]["state"] == "seated" and s["folk"][3]["state"] == "seated", 25, "both seated")
        check("Ch3 leaf laid; both cross and reach the tree", True)
        wait_for(lambda s: s["phase"] == "star", 10, "star phase")
        t = ev("lanternfolk.targets")

    # ------------------------------------------------------------ Star
    shot(sp("05_star.png"))
    t = ev("lanternfolk.targets")
    seq([palm_at(t["star"], dy=-0.035, duration=1.0, label="scoop"), {"label": "hold", "duration": 0.6}])
    s = ev("lanternfolk.star")
    check("Star: scooped onto the open palm", s["rider"] >= 0, json.dumps(s))
    # Failure: shake it and the star rolls off, floating back to its islet.
    for _ in range(3):  # shake (a few rounds at most) until it rolls off
        t = ev("lanternfolk.targets")
        seq([
            palm_at(t["star"], dy=0.18, duration=0.15, label="shake-up"),
            palm_at(t["star"], dy=-0.04, duration=0.15, label="shake-down"),
            palm_at(t["star"], dy=0.18, duration=0.15, label="shake-up2"),
            palm_at(t["star"], dy=-0.04, duration=0.15, label="shake-down2"),
        ])
        if ev("lanternfolk.star")["rider"] < 0:
            break
    cli("xr", "set-transform", payload={"device": "hand-right", "anchor": "wrist", "position": {"x": 0.22, "y": 0.75, "z": -0.15}})
    s = ev("lanternfolk.star")
    check("Star failure: shaking makes it roll off and float home", s["rider"] < 0 and not s["placed"], json.dumps(s))
    rest()
    time.sleep(2.0)  # it floats back to its islet first
    for _ in range(2):
        t = ev("lanternfolk.targets")
        seq([palm_at(t["star"], dy=-0.035, duration=1.0, label="scoop-again"), {"label": "hold", "duration": 1.0}])
        s = ev("lanternfolk.star")
        if s["rider"] >= 0:
            break
        rest()
    check("Star retry: scooped again", s["rider"] >= 0, json.dumps(s))
    t = ev("lanternfolk.targets")
    sock = t["socket"]
    seq([
        palm_at([sock[0], sock[1] - 0.12, sock[2] + 0.05], duration=1.8, label="rise"),
        palm_at([sock[0], sock[1] - 0.045, sock[2]], duration=1.4, label="to-ring"),
        {"label": "hold", "duration": 0.6},
    ])
    wait_for(lambda s: s["phase"] in ("finale", "ending"), 6, "finale")
    check("Finale: carried the star up steadily and set it on the tree", True)
    rest()
    time.sleep(8)
    shot(sp("06_finale.png"))
    s = state()
    gathered = [x["state"] for x in s["folk"]]
    check("Finale: rescued spirits gather; the first friend comes to thank you",
          all(g in ("gather", "thank") for g in gathered) and "thank" in gathered, ",".join(gathered))
    wait_for(lambda s: s["phase"] == "ending", 14, "ending")
    t = ev("lanternfolk.targets")
    before = ev("lanternfolk.musicMuted")
    poke(t["bell"])
    time.sleep(0.4)
    after = ev("lanternfolk.musicMuted")
    check("Music bell toggles music with a touch", before != after, f"{before}->{after}")
    poke(t["bell"])
    rest()
    time.sleep(1.0)
    poke(t["replay"])
    wait_for(lambda s: s["phase"] in ("transition", "play", "intro") and s["level"] == 0, 8, "replay")
    check("Ending: touching the lantern restarts the game", ev("lanternfolk.rescued") == 0)
    rest()

    fails = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(fails)}/{len(results)} checks passed")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
