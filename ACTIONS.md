# How Codex actions shape the score

The live dashboard plays a four-bar A-minor bass melody with held notes while any local Codex session is working. Real actions add the sounds chosen by the listener. New and resumed sessions join automatically. There is one shared bass melody, independent of how many sessions are working, and no scripted session player.

## Work state

| Local Codex record | Dashboard behavior |
| --- | --- |
| `task_started` | Start the bass if needed. Clear only this session’s repeat history. |
| Already working when connected | Start the bass without replaying old actions. |
| `task_complete` for the current turn | Remove this session from the active set. Stop all audio only when no other session is working. |
| `turn_aborted` for the current turn | Remove this session from the active set. Other working sessions keep the music going. |
| Completion for an older turn | Leave the current turn’s state unchanged. |
| Connection interrupted | Pause audio. Reconstruct current state when connected again. |
| No new log records for two minutes during an open turn | Stop counting this session as confirmed work. Pause only if no other session is working. Fresh records restore it. |

The reader checks tracked logs every 300 milliseconds and discovers new activity roughly every two seconds. The browser also pauses if state messages stop arriving for two seconds. Audio disconnect does not stop the Codex process. Browser scheduling and OS sleep can delay updates.

## Editable live sounds

| Action | How it is recognized |
| --- | --- |
| Turn starts | A new `task_started` record received while linked. |
| Read | A named read or file-inspection tool. |
| Search | A named search or browse tool. |
| Edit | A named edit, write or patch tool. |
| Run a command | A shell tool, test tool or the `exec` wrapper. |
| Other tool | A tool name outside the known categories. |
| Repeat | Consecutive calls within one session with the same tool name and argument hash. |
| Tool returns | A return record matched to a tool call. This does not prove success. |

Each live rule selects a synthesized instrument, pattern, pitch, level and mute setting. Classical, Electronic and Hyperpop provide editable starting settings. Changing settings does not create an agent event or start idle playback.

The bass keeps a shared sixteenth-note clock. Accents enter on eighth notes. Same-action bursts merge, and at most two action patterns start on each eighth note. When the final working session ends, queued accents and scheduled audio sources are cleared after the state update. Action history still records muted and merged events.

The log reader forwards metadata only. It hashes tool arguments locally and does not send prompts, arguments, output or reasoning text to the browser. Shell contents are not inspected to guess whether a command read, edited or tested a file.

## Signals not separately available

The current adapter does not infer permission waits, permission denial, tool failure, thinking intervals, subagent activity, notifications or error-specific turn endings. Their older saved mappings remain compatible, but their rows are labelled unavailable and do not offer active controls. Confirmed completion or cancellation of the last working session stops sound, regardless of any saved ending mapping.

Turbella supplies the optional visualizer only. Its hook stream is not used for music or authoritative work state. Its visual waveform is simulated; the dashboard’s Activity meter measures actual browser audio.

## Verification

Automated checks cover joining a working or finished session, cancellation, completion, older-turn completions, partial log writes, historical event exclusion, overlapping sessions, newly discovered sessions, per-session event identity and repeat history, lost connections, suspended audio, event bursts, and preset validation. A local HTTP integration test appends isolated lifecycle and tool records and checks the emitted stream. Synthetic fixtures are test-only and never run in the dashboard.
