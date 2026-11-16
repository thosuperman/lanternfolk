#!/usr/bin/env python3
"""
Film real playthrough takes in the IWER emulator for the demo video.

Everything on screen is the running app; input is emulated hand tracking
driven through the IWSDK CLI (the same path tools/playtest.py verifies).
Managed-browser scripts are capped at 110 s, so the game is filmed as three
takes: A = cold open + level 1, B = level 2, C = level 3 + star finale.
Each take folder gets f*.jpg + frames.json + events.json + marks.json;
tools/encode.py turns a folder into an MP4.

Usage: python3 tools/film.py OUT_DIR [A|B|C ...]
"""
import json
import math
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import playtest  # noqa: E402
from playtest import ROOT, P, cli, ev, seq, wait_for  # noqa: E402

# The camera is directed explicitly; hands must not drag the head or body around.
playtest.SEQ_OPTS.update({"body": "fixed", "gaze": "fixed"})

# The grove is placed relative to the head, so standing height frames identically
# to a seated player while keeping the emulator's arm model within reach.
BASE_HEAD = {"x": 0.0, "y": 1.6, "z": 0.0}
HEAD = dict(BASE_HEAD)
CENTRE = [0.0, 1.6 - 0.36, -0.62]
FLAT = {"fingers": [-1, 0, 0], "palm": "up"}


def look(target, duration=1.2):
    dx, dy, dz = target[0] - HEAD["x"], target[1] - HEAD["y"], target[2] - HEAD["z"]
    yaw = math.degrees(math.atan2(-dx, -dz))
    pitch = math.degrees(math.atan2(dy, math.hypot(dx, dz)))
    cli("xr", "animate-to", payload={"device": "headset", "orientation": {"pitch": pitch, "yaw": yaw, "roll": 0},
                                     "duration": duration, "easing": "minimum-jerk"})
    time.sleep(duration)


def lean_in(duration=2.0, forward=0.17, down=0.05):
    """Lean toward the grove, as a seated player naturally would."""
    global HEAD
    HEAD = {"x": 0.0, "y": BASE_HEAD["y"] - down, "z": -forward}
    cli("xr", "animate-to", payload={"device": "headset", "position": HEAD, "duration": duration, "easing": "minimum-jerk"})


def face(pitch):
    cli("xr", "set-transform", payload={"device": "headset", "position": HEAD, "orientation": {"pitch": pitch, "yaw": 0, "roll": 0}})


def hide_hand(device):
    """Lower a hand out of shot (relative to the seated head), without moving the head."""
    x = 0.3 if device == "hand-right" else -0.3
    cli("xr", "set-transform", payload={"device": device, "anchor": "wrist", "position": {"x": x, "y": HEAD["y"] - 0.75, "z": 0.0}})


def poke(target, settle=0.4):
    seq([
        {"label": "raise", "position": P(target, dx=0.09, dy=0.06, dz=0.12), "anchor": "index-tip", "poseId": "point", "duration": 1.0},
        {"label": "approach", "position": P(target, dz=0.035, dy=0.015), "anchor": "index-tip", "duration": 0.7},
        {"label": "touch", "position": P(target, dz=0.005), "anchor": "index-tip", "duration": 0.35},
        {"label": "hold", "duration": settle},
        {"label": "back", "position": P(target, dx=0.06, dy=0.1, dz=0.12), "anchor": "index-tip", "duration": 0.7},
    ])


def take_a(marks, t):
    # Cold open: the grove rises, the camera settles onto it, then leans in.
    time.sleep(0.6)
    look([0.0, CENTRE[1] + 0.05, -0.55], 2.6)
    time.sleep(1.0)
    lean_in(2.2)
    look([0.0, CENTRE[1] + 0.02, -0.5], 1.5)
    marks["l1"] = time.time()
    look([0.0, CENTRE[1] + 0.04, -0.45], 1.2)
    poke(t["folk1a"])
    hide_hand("hand-right")
    time.sleep(3.6 + 2.4)  # walk to the gap, then let the ghost-hand hint show
    h = t["hint1"]
    marks["bridge"] = time.time()
    seq([
        {"label": "in", "position": P(h, dx=0.12, dy=0.08, dz=0.1), "anchor": "grasp", "poseId": "flat", "orientation": FLAT, "duration": 1.0},
        {"label": "lay", "position": P(h), "anchor": "grasp", "orientation": FLAT, "duration": 0.9},
    ])
    time.sleep(5.2)  # hesitate, cross the hand, walk to the tree, happy bounce
    seq([{"label": "out", "position": P(h, dx=0.15, dy=0.1, dz=0.12), "anchor": "grasp", "orientation": FLAT, "duration": 0.8}])
    hide_hand("hand-right")
    look([0.0, CENTRE[1] + 0.06, -0.6], 1.5)
    time.sleep(5.5)  # celebration + the grove turns to the next friend


def take_b(marks, t):
    lean_in(1.2)
    look([0.0, t["folk2a"][1] + 0.02, -0.45], 1.2)
    poke(t["folk2a"])
    hide_hand("hand-right")
    time.sleep(3.2 + 2.2)
    h, h2 = t["hint2"], t["hintTo2"]
    marks["lift"] = time.time()
    seq([
        {"label": "in", "position": P(h, dx=0.12, dy=0.06, dz=0.1), "anchor": "grasp", "poseId": "flat", "orientation": FLAT, "duration": 1.0},
        {"label": "offer", "position": P(h, dy=0.02), "anchor": "grasp", "orientation": FLAT, "duration": 0.8},
        {"label": "wait", "duration": 1.2},
    ])
    seq([
        {"label": "raise", "position": P(h, dy=0.1, dz=0.01), "anchor": "grasp", "orientation": FLAT, "duration": 1.5},
        {"label": "to-ledge", "position": P(h2, dy=0.03), "anchor": "grasp", "orientation": FLAT, "duration": 1.5},
        {"label": "hold", "duration": 0.8},
    ])
    time.sleep(0.8)
    seq([{"label": "out", "position": P(h2, dx=0.15, dy=0.1, dz=0.14), "anchor": "grasp", "orientation": FLAT, "duration": 0.8}])
    hide_hand("hand-right")
    time.sleep(2.2)
    look([0.0, CENTRE[1] + 0.06, -0.6], 1.5)
    time.sleep(5.5)


def take_c(marks, t):
    lean_in(1.2)
    look([0.0, CENTRE[1] + 0.04, -0.47], 1.2)
    poke(t["folk3a"], settle=0.2)
    poke(t["folk3b"], settle=0.2)
    hide_hand("hand-right")
    time.sleep(2.6)
    leaf, slot = t["leaf"], t["leafSlot"]
    marks["leaf"] = time.time()
    seq([
        {"label": "grab", "position": P(leaf), "anchor": "grasp", "approach": {"distance": 0.06}, "pinch": {"value": 1, "at": "arrival"}, "duration": 1.2},
        {"label": "carry", "position": P(slot, dy=0.03), "anchor": "grasp", "duration": 1.4},
        {"label": "lower", "position": P(slot, dy=0.008), "anchor": "grasp", "duration": 0.6},
        {"label": "release", "pinch": 0, "duration": 0.25},
        {"label": "away", "position": P(slot, dx=0.12, dy=0.12, dz=0.12), "anchor": "grasp", "duration": 0.8},
    ])
    hide_hand("hand-right")
    time.sleep(7.0 + 3.6)  # both cross the leaf, celebration, the star appears
    marks["star"] = time.time()
    star, sock = t["star"], t["socket"]
    look([star[0] * 0.5, (star[1] + sock[1]) / 2, -0.55], 1.4)
    seq([
        {"label": "grab", "position": P(star), "anchor": "grasp", "approach": {"distance": 0.06}, "pinch": {"value": 1, "at": "arrival"}, "duration": 1.3},
        {"label": "carry", "position": P(sock, dy=0.03), "anchor": "grasp", "duration": 1.6},
        {"label": "set", "position": P(sock, dy=0.005), "anchor": "grasp", "duration": 0.5},
        {"label": "release", "pinch": 0, "duration": 0.25},
        {"label": "away", "position": P(sock, dx=0.14, dy=0.02, dz=0.16), "anchor": "grasp", "duration": 0.9},
    ])
    hide_hand("hand-right")
    marks["finale"] = time.time()
    look([0.0, sock[1] - 0.14, -0.62], 3.0)
    time.sleep(3.5)
    look([0.0, CENTRE[1] + 0.06, -0.58], 2.5)
    time.sleep(5.0)


TAKES = {"A": (0, take_a), "B": (1, take_b), "C": (2, take_c)}


def setup(level):
    """Everything that needs browser commands happens before the recorder starts."""
    st = cli("xr", "status")["data"]["result"]
    if not st.get("sessionActive"):
        cli("xr", "enter")
        time.sleep(1.2)
    cli("xr", "set-input-mode", payload={"mode": "hand"})
    cli("xr", "set-device-state", payload={"state": {"fov": 58}})
    global HEAD
    HEAD = dict(BASE_HEAD)
    hide_hand("hand-left")
    hide_hand("hand-right")
    face(-24 if level == 0 else -30)
    ev(f"lanternfolk.skipTo({level})")
    time.sleep(0.3)
    ev("lanternfolk.recenter()")  # place the grove for this head pose, exactly as the XR restart will
    # The page can't be queried during a take (browser scripts are serialized),
    # so read every target now. The grove is re-placed identically at XR restart.
    return ev("lanternfolk.targets")


def record(out, name):
    folder = os.path.join(out, name)
    os.makedirs(folder, exist_ok=True)
    for f in os.listdir(folder):
        os.remove(os.path.join(folder, f))
    level, body = TAKES[name]
    t = setup(level)
    open(os.path.join(folder, "GO"), "w").write("1")
    env = dict(os.environ, REC_DIR=folder, REC_SECONDS="105")
    log = open(os.path.join(folder, "recorder.log"), "w")
    rec = subprocess.Popen(["npx", "iwsdk", "browser", "run", "tools/record.mjs", "--timeout", "110000"], cwd=ROOT, env=env,
                           stdout=log, stderr=subprocess.STDOUT, text=True)
    marks = {}
    try:
        for _ in range(300):
            if os.path.exists(os.path.join(folder, "VIEWPORT_READY")):
                break
            time.sleep(0.1)
        marks["start"] = time.time()
        if level == 0:
            face(-12)
        time.sleep(3.2)  # XR restart + grove reveal
        body(marks, t)
        marks["end"] = time.time()
    finally:
        open(os.path.join(folder, "GO"), "w").write("1")
        open(os.path.join(folder, "STOP"), "w").write("1")
        rec.wait(timeout=120)
        log.close()
        first = open(os.path.join(folder, "recorder.log")).read().splitlines()
        print(name, first[0] if first else "no recorder output", flush=True)
        if "start" in marks:
            json.dump({k: v - marks["start"] for k, v in marks.items()}, open(os.path.join(folder, "marks.json"), "w"), indent=1)
            print(name, {k: round(v - marks["start"], 1) for k, v in marks.items()}, flush=True)


def main():
    out = os.path.abspath(sys.argv[1])
    for name in sys.argv[2:] or ["A", "B", "C"]:
        record(out, name)


if __name__ == "__main__":
    main()
