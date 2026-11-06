# Session Score

Session Score lets you choose what your coding agent sounds like. Start with Classical, Electronic or Hyperpop, then assign a sound and pattern to each action.

## Open the dashboard

Install Node.js 22 or later, clone this repo, and run these commands from its folder.

```sh
npm run dev
```

Open [Session Score on your computer](http://127.0.0.1:8787). The dashboard uses Node's built-in server and browser audio. It has no npm dependencies.

1. Turn **Link all Codex** on. It follows every local Codex session automatically, including new chats and resumed sessions. There is no session picker.
2. While any session is working, a four-bar A-minor bass melody with held notes plays. Real tool actions add the sounds in **Make the rules**. The bass and accents share a beat.
3. Choose Classical, Electronic or Hyperpop as starting sound settings, then change each action’s sound, pattern, pitch, level or mute. These settings do not simulate activity or start playback by themselves.
4. Finishing or cancelling one session leaves the music running if another session is still working. When the last working session ends, the bass, accents and queued notes stop. The link stays on for future work. **Disconnect audio** stops this page’s audio and connection. It does not cancel Codex.

There is no scripted session preview or sound-audition player in the dashboard. Joining an active turn starts the bass immediately after the browser enables audio. Connecting while all sessions are idle stays silent. The status shows the number of working sessions; each action in the activity list carries its source session ID. If the browser suspends audio, the page shows **Enable audio**. Master volume at zero is also shown in the status.

Edits save separately for each sound preset in this browser. Export and import preserve those settings. Older configuration files still load; their old arrangement field no longer changes live playback.

### How the connection works

The Node server reads local Codex JSONL session logs under `$CODEX_HOME/sessions`, or `~/.codex/sessions`. It follows `task_started`, `task_complete` and `turn_aborted` records for work state, and tool call/return records for musical accents. It polls tracked sessions every 300 milliseconds and discovers newly active files roughly every two seconds. Recently updated logs are reconstructed on connection; older logs join when they change. It reconstructs the current state when connecting, without replaying old actions. Compaction does not count as a turn ending.

The browser receives only session IDs, state, timestamps, tool names and argument hashes. Prompts, tool arguments, outputs and reasoning text are not sent to it. Tool names determine the sound category. Shell tools and the `exec` wrapper use the command sound, regardless of what their contents do. Consecutive identical calls within the same session use the repeat mapping. Interleaved sessions keep separate repeat histories. Tool returns indicate a returned result, not proof that the command succeeded. The reader does not infer errors or approval requests from tool output; unavailable categories are labelled in the dashboard.

Accents start on an eighth-note grid. Repeated events in one subdivision share an accent, with at most two action patterns starting per eighth note. Only the bass repeats automatically. The selected action mappings control all other sounds.

A lost browser connection pauses sound within about two seconds. If an open turn produces no new log records for two minutes, it is no longer counted as confirmed work. Music continues if another session is working; otherwise it pauses and reports uncertainty until fresh records arrive. This protects against abandoned sessions, but can also pause a very long tool or thinking interval. Completion or cancellation of the last working session stops sound on the next log poll, without waiting for the musical bar to end. Background-tab throttling and OS sleep can delay browser updates.

The small Turbella visualizer remains optional and shows all Turbella sessions, matching the wallpaper’s scope. It is shown while any Codex session is working. Turbella can also show non-Codex agents; the music currently follows local Codex logs only. Turbella does not drive audio or decide when the turn ends. Its simulated visual waveform is not the dashboard’s audio meter; **Activity** shows the actual audio meter.

This reader supports the local log format verified during development. It does not monitor remote sessions or Codex versions that omit these lifecycle records. Unsupported or unreadable state stays silent. No API key or Turbella plugin is required for dashboard audio.

Keep the local server running while listening. Press Control-C in its terminal to stop it. Use `PORT=8788 npm run dev` if the default port is occupied. Use `TURBELLA_PORT=7378 npm run dev` if the optional visualizer runs on another port.

Run `npm test` for lifecycle, cancellation, reconnect, overlapping sessions, automatic discovery, independent repeat histories, event timing, configuration and generated-audio checks. See [ACTIONS.md](ACTIONS.md) for the current action contract.

## Earlier listening experiments

The audio files and Python player below are earlier experiments. They are separate from the live dashboard.

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
