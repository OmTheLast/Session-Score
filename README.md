<h1 align="center">Session Score</h1>

**Hear what Codex is doing while you work. A bass line plays during a session, and each read, edit or command adds a part you can choose.**

[Listen to the 22-second Electronic sketch from the original prototype](https://raw.githubusercontent.com/OmTheLast/Session-Score/main/electronic.mp3)

Runs as a Mac app with local Codex session logs. The app includes its runtime and reads the logs directly. Prompts and tool output stay out of the dashboard feed.

Built by Om Patnaik in November 2026. [Source release v0.1.0](https://github.com/OmTheLast/Session-Score/releases/tag/v0.1.0)

![Session Score mixer showing the Undertow bass melody, the hold control, and separate levels for bass, keys, synth, chords and drums](guide/mixer.png)

## Install and hear your first session

| Platform | Install |
| --- | --- |
| macOS, Apple silicon (tested) | Build the app from source using Node.js 22.12 or later and the Xcode Command Line Tools. |
| Browser dashboard | With Node.js 22 or later, run `npm run dev` from the same checkout and open the printed address. |

```sh
git clone https://github.com/OmTheLast/Session-Score.git
cd Session-Score
npm run package:mac
open dist/Session-Score-macOS-arm64.zip
```

Move the extracted **Session Score** app to Applications and open it. Turn on **Link all Codex** at the top of the window, then send a prompt in Codex. Bass starts when a session works. A read, edit or command adds a part on the next bar. You can close the terminal and keep listening.

The app saves its own settings. To bring over a browser preset, use **Export settings** in the dashboard, then **Import settings** in the app. The local build is ad-hoc signed. Apple has not notarized it for distribution.

To explore the controls before installing, download the listener guide and open it in your browser. Its screenshots show a sample session. [Download the listener guide](https://github.com/OmTheLast/Session-Score/raw/refs/heads/main/guide/index.html)

## Why

When you switch away from a long coding session, you lose track of whether the agent is searching, making changes or finished. Session Score follows the work across all your local Codex sessions. When the last one finishes, the music fades.

## Choose what an action sounds like

Pick Classical, Electronic or Hyperpop. Under **Make the rules**, try assigning keys to file reads and a drum groove to commands. Each part enters on the next bar, so events that happen at irregular times share a beat. You can set each part to last one, two, four or eight bars.

Under **Shape the arrangement**, hold one bass melody or rotate through ten. The mixer controls how much of each part you hear. Use **Export settings** to save a preset or share it with another listener.

## Notes from building it

I wanted to hear my own coding sessions as they happened. The early version could keep playing after Codex finished, so I tied playback to the start and end of a turn in the session log. Individual tool sounds still felt disconnected, so I gave them a shared bass melody and made them enter on bar boundaries.

## Commands

```sh
npm run package:mac    # Build the Mac app and ZIP in dist/
npm run dev            # Start the dashboard on port 8787
PORT=8788 npm run dev  # Choose another port on macOS
npm test               # Run the checks
```

## Verify it yourself

```sh
npm test
```

The tests follow sample session logs through the local HTTP server, including overlapping sessions, cancellations and reconnects. They also check that action phrases stay on the beat and that saved presets keep their settings. To check a built app, run the packaged playback test with an isolated Codex log and app profile.

```sh
uv run --with playwright python desktop/smoke.py "dist/Session Score-darwin-arm64/Session Score.app"
```

## Credits and license

[Turbella](https://github.com/NakliTechie/turbella) provides the optional visualizer. Session Score uses the browser’s Web Audio API to play the music.

Session Score is available under the [MIT License](LICENSE).

[Listener guide](guide/index.html) · [Action rules](ACTIONS.md) · [Earlier audio sketches](samples/README.md) · [Changelog](CHANGELOG.md)
