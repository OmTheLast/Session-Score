# Session Score

Session Score turns activity from a coding agent into music. Electric piano and drums hold a steady groove. When Codex starts a tool call, the bass adds a short run for one bar. Another call keeps it going.

## Listen first

[Play or download the first groove](first-groove.mp3). The first ten seconds introduce the tune. At ten seconds the chords cycle back to the start, but the bass plays more notes. At about eighteen seconds it settles down. The recording uses scripted calls so everyone hears the same comparison.

Try one listening test. Would you keep this playing while you work?

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
.venv/bin/python play_live.py SESSION_ID
```

Send another prompt in that same Codex session. The player uses new events from Turbella on your machine. It rests when a turn ends or after 15 seconds of silence. Press Control-C to stop playback.

## Change the tune

Edit the chords or bass pattern in `score.py`, then run `.venv/bin/python score.py` to render `first-groove.wav`. The live player and the recording use the same instrument.
