# Session Score

Session Score lets you choose what your coding agent sounds like. Start with Classical, Electronic or Hyperpop, then assign a sound and pattern to each action.

## Open the dashboard

Install Node.js 22 or later, clone this repo, and run these commands from its folder.

```sh
npm run dev
```

Open [Session Score on your computer](http://127.0.0.1:8787). The dashboard uses Node's built-in server and browser audio. It has no npm dependencies.

1. Pick a preset and tap sounds in **Try the kit**. The first sound bank includes synthesized 808 sub bass, kick, snare, clap and hats, plus keys, a string pad and a bright synth.
2. Under **Make the rules**, choose the sound, pattern, pitch and level for each action. Use the play button to hear a mapping. Use ON/OFF to mute it.
3. Choose **Dark melody + 808** for a continuous A-minor arrangement, or **Individual action sounds** to hear your action mappings. Press **Preview session** to audition the selected mode.
4. To follow an agent, start [Turbella](https://github.com/NakliTechie/turbella#install) and send a prompt in that agent. In the dashboard, refresh sessions, choose yours and turn **Link Codex** on. The newest Codex session is selected automatically. The small Turbella window shows that same session. **Open larger** opens its full visualizer. Disconnecting or starting a scripted preview closes the embedded feed.

Edits save in this browser separately for each preset. Export settings downloads the selected preset as JSON so someone else can import it. Each person runs the dashboard and Turbella on their own computer.

**Link Codex** starts or stops the live connection and its soundtrack. In Dark melody mode the track starts as soon as the stream connects. **Stop all sound** also stops the preview and disconnects a live session. Sound starts only after you press a preview or connect button. In Individual action sounds mode, the page plays each mapping on the next eighth note. Dark melody uses its own steady sixteenth-note clock and a four-bar arrangement.

The live feed contains tool names, statuses and hashes. A shell command gets the command sound even if it ran a test or read a file. Consecutive identical tool starts get the repeat mapping. Unknown tools use Other tool. A permission or stop event clears pending sounds before playing its own cue. Codex shell failures may lack a failure signal.

The dashboard is available while the local server is running. Press Control-C in its terminal to stop it. If Turbella uses another port, start with `TURBELLA_PORT=7378 npm run dev`. If the dashboard port is busy, use `PORT=8788 npm run dev`.

Run `npm test` to check event classification, preset file validation and the generated audio.

See the broader [action design notes](ACTIONS.md) for the intended musical roles. Dark melody is the first continuous browser arrangement. Edits increase bass activity, searches add hats, and repeated actions add a rim fill. Event bursts are capped at three intensity steps and applied at bar boundaries. Permission waits leave a quiet pad. A turn end finishes at the next bar and rests until new activity arrives.

## Audition ten electronic sounds

Compare ten original 12-second sketches, from liquid drum and bass to ambient and hyperpop. Each follows the same scripted session. [Play the two-minute sampler or choose individual tracks](samples/README.md).

## Listen to Electronic

[Play the 22-second Electronic preview](electronic.mp3). The track follows a scripted session at 120 BPM. Listen for the last note of each phrase.

| Time | What you hear |
| --- | --- |
| 0:00 | Bass, drums and short offbeat chords set the groove. |
| 0:04 | A tool call brings in E, G, then a longer B. |
| 0:08 | The same call starts again. The B becomes two short pulses. |
| 0:12 | A different call introduces a descending melody. |
| 0:16 | That call repeats. The ending of the second melody pulses too. |
| 0:20 | The turn ends. The beat drops out and three notes settle on the current chord. |

The live player recognizes consecutive starts of the same tool with the same input signature within a turn. A signature is a hash supplied by Turbella. Calls without a signature use the ordinary melody. A repeat can mean the agent is checking its work.

The original electric piano groove is also available. [Listen to Groove](first-groove.mp3).

## Earlier Python player

You need Python 3, a working audio output, and Turbella running locally with its Codex hooks enabled. Follow the [Turbella setup instructions](https://github.com/NakliTechie/turbella#install).

From the Session Score folder, set up Python once on macOS:

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Start a Codex session, send a prompt, then run this in a second terminal to see recent sessions:

```sh
curl -s http://127.0.0.1:7377/status
```

Copy the session ID for your Codex session. Replace SESSION_ID below with that ID:

```sh
.venv/bin/python play_live.py SESSION_ID --preset electronic
```

Omit the preset flag for the original Groove arrangement. Send another prompt in that same Codex session. The player uses new events from Turbella on your machine. It rests when a turn ends or after 15 seconds of silence. Press Control-C to stop playback.

## Change the tune

The original Electronic phrases are written in `electronic.py`. Each note has a start time, pitch and duration. Change `SIGNAL` or `ANSWER` to write a new hook, or change `PULSE_END` to try a different repeat rhythm. Run `.venv/bin/python electronic.py` to render `electronic.wav`. The live player uses the same score.

For the original groove, edit `score.py` and run `.venv/bin/python score.py` to render `first-groove.wav`.
