"""Run with uv run --with playwright python desktop/smoke.py "path/to/Session Score.app"."""
import json
import os
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from playwright.sync_api import expect, sync_playwright


def append(log, kind, **payload):
    with log.open("a") as stream:
        print(json.dumps(dict(timestamp=datetime.now(timezone.utc).isoformat(),
                              type=kind, payload=payload)), file=stream)


# The visible meter reads the analyser immediately before the audio output.
METER = """() => {
    const ctx = document.querySelector('#meter').getContext('2d');
    const pixels = ctx.getImageData(0, 0, 540, 72).data;
    return pixels.some((value, i) => i % 4 === 0 && value === 198);
}"""


def check(bundle, root):
    codex = root / "codex"
    logs = codex / "sessions"
    logs.mkdir(parents=True)
    first, second = (logs / f"rollout-{uuid4()}.jsonl" for _ in range(2))
    profile = root / "profile"
    binary = bundle / "Contents/MacOS/Session Score"
    child = subprocess.Popen([str(binary), "--remote-debugging-port=0", f"--user-data-dir={profile}"],
                             env={**os.environ, "CODEX_HOME": str(codex), "TURBELLA_PORT": "1"})
    try:
        port_file = profile / "DevToolsActivePort"
        for _ in range(200):
            if child.poll() is not None:
                raise RuntimeError(f"App exited during startup ({child.returncode})")
            if port_file.exists() and port_file.stat().st_size:
                break
            time.sleep(.1)
        port = port_file.read_text().splitlines()[0]
        with sync_playwright() as pw:
            browser = pw.chromium.connect_over_cdp(f"http://127.0.0.1:{port}")
            context = browser.contexts[0]
            page = context.pages[0] if context.pages else context.wait_for_event("page")
            page.wait_for_url("score://studio/")
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            expect(page.locator("#connection-status")).to_contain_text("Ready to follow")
            assert page.evaluate("typeof require") == "undefined"
            assert page.evaluate("typeof process") == "undefined"
            page.locator("[data-preset=hyperpop]").click()
            page.reload()
            expect(page.locator("[data-preset=hyperpop]")).to_have_attribute("aria-pressed", "true")
            page.get_by_text("Link all Codex", exact=True).click()
            state = page.locator("#link-state")
            expect(state).to_contain_text("idle")
            assert not page.evaluate(METER)
            append(first, "event_msg", type="task_started", turn_id="one")
            expect(state).to_contain_text("1 Codex session working")
            page.wait_for_function(METER)
            append(first, "response_item", type="function_call", name="apply_patch", call_id="c",
                   arguments="private fixture")
            expect(page.locator("#activity")).to_contain_text("Edit code")
            append(second, "event_msg", type="task_started", turn_id="two")
            expect(state).to_contain_text("2 Codex sessions working")
            append(first, "event_msg", type="turn_aborted", turn_id="one")
            expect(state).to_contain_text("1 Codex session working")
            append(second, "event_msg", type="task_complete", turn_id="two")
            expect(state).to_contain_text("idle")
            page.wait_for_function(f"() => !({METER})()")
            append(second, "event_msg", type="task_started", turn_id="three")
            expect(state).to_contain_text("1 Codex session working")
            page.get_by_text("Link all Codex", exact=True).click()
            expect(state).to_contain_text("OFF")
            page.wait_for_function(f"() => !({METER})()")
            assert "private fixture" not in page.locator("body").inner_text()
            assert not errors, errors
            print("PASS: packaged launch, isolated renderer, saved preset, idle silence, audio meter, "
                  "live edit, concurrent sessions, completion and disconnect.")
    finally:
        if child.poll() is None:
            child.terminate()
        child.wait(timeout=10)


if __name__ == "__main__":
    with tempfile.TemporaryDirectory(prefix="session-score-smoke-") as directory:
        check(Path(sys.argv[1]).resolve(), Path(directory))
