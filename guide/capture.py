"""Capture Session Score against a temporary Codex log containing only fixture events."""
import json
import os
import shlex
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

GUIDE = Path(__file__).resolve().parent
ROOT = GUIDE.parent
SHOTS = GUIDE / 'screenshots' / 'listener'
TEXT = GUIDE / 'transcripts' / 'listener'
HERO_FLOW = ['listener/01-presets', 'listener/02-link', 'listener/03-activity']
# id, backend, UI target or command. Readiness is driven by visible state.
ROUTES = [
    ('01-presets', 'browser', '.presets'), ('02-link', 'browser', '.live-panel'),
    ('03-activity', 'browser', '.activity-panel'), ('04-mix', 'browser', '.mixer-panel'),
    ('05-inventory', 'browser', '.inventory-panel'), ('06-rules', 'browser', '.table-scroll:has(#mappings)'),
    ('07-settings', 'browser', '.mapping-footer'), ('08-finish', 'browser', '.transport'),
    ('09-cli', 'cli', 'python3 play_live.py --help'),
]
SEED = json.loads((ROOT / 'demo/seed/session.json').read_text())
SESSION = SEED['session']


def record(path, kind, payload):
    with path.open('a') as stream:
        print(json.dumps(dict(timestamp=datetime.now(timezone.utc).isoformat(), type=kind, payload=payload)), file=stream)


def capture(page, path):
    errors = []
    page.on('console', lambda message: errors.append(message.text) if message.type in ('warning', 'error') else None)
    page.on('pageerror', lambda error: errors.append(str(error)))
    for slug, backend, target in ROUTES:
        if backend == 'cli':
            result = subprocess.run([sys.executable, *shlex.split(target)[1:]], cwd=ROOT, capture_output=True, text=True, check=True)
            assert result.stdout.strip()
            (TEXT / f'{slug}.txt').write_text(f'$ {target}\n{result.stdout}{result.stderr}\nExit {result.returncode}\n')
            continue
        if slug == '01-presets':
            page.locator('[data-preset=electronic]').click()
        elif slug == '02-link':
            page.get_by_text('Link all Codex', exact=True).click()
            expect(page.locator('#link-state')).to_contain_text('idle', timeout=10000)
        elif slug == '03-activity':
            record(path, 'event_msg', dict(type='task_started', turn_id='guide'))
            expect(page.locator('#link-state')).to_contain_text('working', timeout=10000)
            for action in SEED['events']:
                name = action['tool']
                record(path, 'response_item', dict(type='function_call', name=name, call_id=name, arguments='{}'))
            expect(page.locator('#activity')).to_contain_text('Run a command')
        elif slug == '04-mix':
            page.locator('#bass-melody').select_option('undertow')
            page.locator('#bass-mode').select_option('hold')
        elif slug == '06-rules':
            page.locator('[data-action=read] select[aria-label$="variation"]').select_option('evolving')
        elif slug == '07-settings':
            with page.expect_download() as download:
                page.locator('#export').click()
            settings = path.parent.parent / 'guide-preset.json'
            download.value.save_as(settings)
            page.locator('#import-file').set_input_files(settings)
            expect(page.locator('#toast')).to_contain_text('imported', timeout=10000)
        elif slug == '08-finish':
            record(path, 'event_msg', dict(type='task_complete', turn_id='guide'))
            expect(page.locator('#link-state')).to_contain_text('idle', timeout=10000)
        page.evaluate('document.fonts.ready')
        deadline = time.monotonic() + 5
        while not page.evaluate("[...document.images].every(i=>i.complete) && document.getAnimations().every(a=>a.playState!=='running'||a.effect?.getComputedTiming().endTime===Infinity)"):
            if time.monotonic() > deadline:
                raise RuntimeError(f'{slug} did not settle')
            page.wait_for_timeout(50)
        element = page.locator(target)
        assert element.inner_text().strip() and element.is_visible(), slug
        element.screenshot(path=SHOTS / f'{slug}.png', animations='disabled')
        print(slug, 'ok', ' | '.join(errors)); errors.clear()


def main():
    SHOTS.mkdir(parents=True, exist_ok=True)
    TEXT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as seed:
        sessions = Path(seed) / 'sessions'; sessions.mkdir()
        path = sessions / f'rollout-guide-{SESSION}.jsonl'; record(path, 'event_msg', dict(type='task_complete', turn_id='previous-guide'))
        env = dict(os.environ, CODEX_HOME=seed, PORT='0', TURBELLA_PORT='1')
        server = subprocess.Popen(['node','dashboard/server.mjs'], cwd=ROOT, env=env, stdout=subprocess.PIPE, text=True)
        try:
            origin = server.stdout.readline().strip().split()[-1]
            assert origin.startswith('http://127.0.0.1:')
            with sync_playwright() as pw:
                browser = pw.chromium.launch(channel=os.environ.get('GUIDE_BROWSER','chrome'), args=['--mute-audio'])
                page = browser.new_page(viewport={'width':1500,'height':940}, device_scale_factor=2, reduced_motion='reduce')
                # No real Turbella, personal sessions or external resources in guide screenshots.
                def fixture_only(route):
                    if route.request.url.startswith(origin+'/api/visualizer'):
                        return route.fulfill(content_type='text/html', body='<body style="background:#151719;color:#aaa;font:14px system-ui">Optional visualizer omitted in guide capture.</body>')
                    if route.request.url.startswith(origin+'/favicon'):
                        return route.fulfill(status=204)
                    if route.request.url.startswith(origin+'/'):
                        return route.continue_()
                    return route.abort()
                page.route('**/*', fixture_only)
                page.goto(origin,wait_until='load'); capture(page,path)
                browser.close()
        finally:
            server.terminate(); server.wait(timeout=5)

if __name__ == '__main__':
    main()
