# How Codex actions shape the score

The live dashboard plays a four-bar A-minor bass melody with held notes while the selected Codex turn is working. Real actions add the sounds chosen by the listener. There is no scripted session player.

## Work state

| Local Codex record | Dashboard behavior |
| --- | --- |
| `task_started` | Start the bass. Clear the previous turn’s repeat history. |
| Already working when connected | Start the bass without replaying old actions. |
| `task_complete` for the current turn | Stop all audio, including scheduled notes. Keep listening for the next turn. |
| `turn_aborted` for the current turn | Stop all audio and display cancellation. |
| Completion for an older turn | Leave the current turn’s state unchanged. |
| Connection interrupted | Pause audio. Reconstruct current state when connected again. |
| No new log records for two minutes during an open turn | Display unknown state and pause. Fresh records restore playback. |

The reader checks every 300 milliseconds. The browser also pauses if state messages stop arriving for two seconds. Audio disconnect does not stop the Codex process. Browser scheduling and OS sleep can delay updates.

## Editable live sounds

| Action | How it is recognized |
| --- | --- |
| Turn starts | A new `task_started` record received while linked. |
| Read | A named read or file-inspection tool. |
| Search | A named search or browse tool. |
| Edit | A named edit, write or patch tool. |
| Run a command | A shell tool, test tool or the `exec` wrapper. |
| Other tool | A tool name outside the known categories. |
| Repeat | Consecutive calls with the same tool name and argument hash. |
| Tool returns | A return record matched to a tool call. This does not prove success. |

Each live rule selects a synthesized instrument, pattern, pitch, level and mute setting. Classical, Electronic and Hyperpop provide editable starting settings. Changing settings does not create an agent event or start idle playback.

The bass keeps a shared sixteenth-note clock. Accents enter on eighth notes. Same-action bursts merge, and at most two action patterns start on each eighth note. Stopping clears queued accents and already scheduled audio sources immediately after the state update. Action history still records muted and merged events.

The log reader forwards metadata only. It hashes tool arguments locally and does not send prompts, arguments, output or reasoning text to the browser. Shell contents are not inspected to guess whether a command read, edited or tested a file.

## Signals not separately available

The current adapter does not infer permission waits, permission denial, tool failure, thinking intervals, subagent activity, notifications or error-specific turn endings. Their older saved mappings remain compatible, but their rows are labelled unavailable and do not offer active controls. Confirmed completion and cancellation always stop sound, regardless of any saved ending mapping.

Turbella supplies the optional visualizer only. Its hook stream is not used for music or authoritative work state. Its visual waveform is simulated; the dashboard’s Activity meter measures actual browser audio.

## Verification

Automated checks cover joining a working or finished session, cancellation, completion, older-turn completions, partial log writes, historical event exclusion, another session’s events, lost connections, suspended audio, event bursts, and preset validation. A local HTTP integration test appends isolated lifecycle and tool records and checks the emitted stream. Synthetic fixtures are test-only and never run in the dashboard.
