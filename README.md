# Session Score

Session Score turns a coding session into music. A preset supplies the notes and the beat. Tool calls tell the player when to introduce a phrase, bring it back, or play an ending.

See how reads, edits, repeats and permission requests fit into the [proposed action map](ACTIONS.md).

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

## Play it live

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
