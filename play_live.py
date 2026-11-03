"""Play new Turbella events for one Codex session as a live groove."""
import argparse
import json
from queue import Empty, SimpleQueue
from threading import Thread
import time
from urllib.request import ProxyHandler, build_opener
from uuid import UUID

import sounddevice as sd

from score import Groove


def cue(event):
    kind = event["kind"]
    if kind == "tool":
        return "call" if event["status"] == "waiting" else "return"
    return {"turn": "start", "stop": "finish"}.get(kind)


def listen(stream, started_ms, queue):
    try:
        for line in stream:
            if line.startswith(b"data: "):
                event = json.loads(line[6:])
                sound = cue(event)
                if sound:
                    if event["ts"] >= started_ms:
                        queue.put(sound)
                    else:
                        print("Earlier event:", sound, flush=True)
    finally:
        queue.put("disconnected")


def play(session):
    started_ms = time.time_ns() // 1_000_000
    url = f"http://127.0.0.1:7377/events?agent=codex&session={session}"
    # Avoid sending loopback requests through a configured system proxy.
    stream = build_opener(ProxyHandler({})).open(url)
    device = sd.query_devices(kind="output")
    synth = Groove(int(device["default_samplerate"]))
    queue = SimpleQueue()
    Thread(target=listen, args=(stream, started_ms, queue), daemon=True).start()
    with sd.OutputStream(samplerate=synth.rate, channels=1, dtype="float32") as output:
        print("Listening on", device["name"], flush=True)
        last = time.monotonic()
        active = False
        while time.monotonic() - last < 1800:
            events = []
            try:
                while True:
                    event = queue.get_nowait()
                    if event == "disconnected":
                        raise ConnectionError("The local Turbella stream closed.")
                    events.append(event)
            except Empty:
                pass
            if events:
                active = events[-1] != "finish"
                last = time.monotonic()
                print(" ".join(events), flush=True)
            output.write(synth.play_step(events, active and time.monotonic() - last < 15))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("session", type=UUID)
    try:
        play(parser.parse_args().session)
    except KeyboardInterrupt:
        pass
