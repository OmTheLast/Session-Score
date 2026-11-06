# Session Score

Session Score lets you choose what your coding agent sounds like. Start with Classical, Electronic or Hyperpop, then let real agent activity build keys, synth, chord and drum parts over a bass melody.

## Open the dashboard

Install Node.js 22 or later, clone this repo, and run these commands from its folder.

```sh
npm run dev
```

Open [Session Score on your computer](http://127.0.0.1:8787). The dashboard uses Node's built-in server and browser audio. It has no npm dependencies.

1. Turn **Link all Codex** on. It follows every local Codex session automatically, including new chats and resumed sessions. There is no session picker.
2. While any session is working, a four-bar A-minor bass melody with held notes plays. Real tool actions activate the musical parts in **Make the rules** for one, two or four bars. The bass and accents share a beat.
3. Choose Classical, Electronic or Hyperpop as starting sound settings, then change each action’s musical part, instrument, pattern, variation, phrase length, pitch, level or mute. **Shape the arrangement** controls bass, keys, synth, chords and drums separately, plus how strongly repeated work builds intensity. These settings do not simulate activity or start playback by themselves.
4. Finishing or cancelling one session leaves the music running if another session is still working. When the last working session completes normally, new notes stop and existing notes fade for up to 0.8 seconds. Cancellation stops audio immediately. The link stays on for future work. **Disconnect audio** stops this page’s audio and connection. It does not cancel Codex.

There is no scripted session preview or sound-audition player in the dashboard. Joining an active turn starts the bass immediately after the browser enables audio. Connecting while all sessions are idle stays silent. The status shows the number of working sessions; each action in the activity list carries its source session ID. If the browser suspends audio, the page shows **Enable audio**. Master volume at zero is also shown in the status.

Edits save separately for each sound preset in this browser. Export and import preserve those settings. Version 1 files migrate to version 2. Untouched default fields acquire the new musical settings; customized sound, pattern, pitch, level and mute fields are preserved. Mixer settings and musical roles are included in new exports. The old arrangement field no longer changes live playback.

### How the connection works

The Node server reads local Codex JSONL session logs under `$CODEX_HOME/sessions`, or `~/.codex/sessions`. It follows `task_started`, `task_complete` and `turn_aborted` records for work state, and tool call/return records for musical accents. It polls tracked sessions every 300 milliseconds and discovers newly active files roughly every two seconds. Recently updated logs are reconstructed on connection; older logs join when they change. It reconstructs the current state when connecting, without replaying old actions. Compaction does not count as a turn ending.

The browser receives only session IDs, state, timestamps, tool names and argument hashes. Prompts, tool arguments, outputs and reasoning text are not sent to it. Tool names determine the activity. Explicitly named test tools have their own test part; tests inside generic shell wrappers remain command activity. Shell tools and the `exec` wrapper use the command sound, regardless of what their contents do. Consecutive identical calls within the same session use the repeat mapping. Interleaved sessions keep separate repeat histories. Tool returns indicate a returned result, not proof that the command succeeded. The reader does not infer errors or approval requests from tool output; unavailable categories are labelled in the dashboard.

Real actions queue musical parts for the next bar boundary. The live readout shows parts waiting to enter. Reads add a keys phrase, searches add an arpeggio (notes of a chord played in sequence), edits add held chords, and command activity adds a drum groove with melodic synth accents. Named tests use a faster synth pattern. Repeats vary the session’s current phrase and add a fill. The bass keeps its four-bar melody. Keys follow that melody’s notes, and synth lines use nearby chord tones. Command accents land with the bass and leave space when a keys or synth part is already playing. Chords keep shared notes between changes, with soft attacks and releases.

Parts last one, two or four complete bars from their queued entry or renewal, then fade. Phrase variations and tempo edits take effect at bar boundaries. Each action has a Variation setting: Steady keeps its motif, Subtle alternates two related versions, and Evolving cycles three with more rhythmic changes. Further real activity queues at most one variation per bar, including when a part returns after expiring. Changes stay in the same key, register and beat grid. Further events renew them with gradual level changes. Intensity builds at most once per beat, so bursts cannot instantly maximize the arrangement. Multiple sessions contributing the same musical role share a voice; at most three melodic parts, a groove and a fill are scheduled together. The status under the mixer names the activities, contributing-session count and remaining bars. A finished session’s contributions are removed. After the final normal completion, only already sounding notes can finish their short fade. Changing a mixer channel to zero also stops its sounding notes.

A lost browser connection pauses sound within about two seconds. If an open turn produces no new log records for two minutes, it is no longer counted as confirmed work. Music continues if another session is working; otherwise it pauses and reports uncertainty until fresh records arrive. This protects against abandoned sessions, but can also pause a very long tool or thinking interval. On the next log poll, normal completion cancels queued notes and releases sounding notes over at most 0.8 seconds; cancellation stops immediately. The status says “finished · fading out” during the release. Background-tab throttling and OS sleep can delay browser updates. The audio clock skips missed grid positions without shifting the beat or replaying a backlog.

The small Turbella visualizer remains optional and shows all Turbella sessions, matching the wallpaper’s scope. It is shown while any Codex session is working. Turbella can also show non-Codex agents; the music currently follows local Codex logs only. Turbella does not drive audio or decide when the turn ends. Its simulated visual waveform is not the dashboard’s audio meter; **Activity** shows the actual audio meter.

This reader supports the local log format verified during development. It does not monitor remote sessions or Codex versions that omit these lifecycle records. Unsupported or unreadable state stays silent. No API key or Turbella plugin is required for dashboard audio.

Keep the local server running while listening. Press Control-C in its terminal to stop it. Use `PORT=8788 npm run dev` if the default port is occupied. Use `TURBELLA_PORT=7378 npm run dev` if the optional visualizer runs on another port.

Run `npm test` for sustained parts, phrase expiry, bounded event bursts, harmonic alignment, settings migration, lifecycle, cancellation, reconnect, overlapping sessions, automatic discovery, independent repeat histories, event timing, configuration and generated-audio checks. See [ACTIONS.md](ACTIONS.md) for the current action contract.

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
