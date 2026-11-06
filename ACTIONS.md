# How Codex actions shape the score

The live dashboard plays a four-bar A-minor bass melody with held notes while any local Codex session is working. Real actions activate musical parts chosen by the listener. New and resumed sessions join automatically. There is one shared bass melody, independent of how many sessions are working, and no scripted session player.

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
| Run a command | A shell tool or the `exec` wrapper. |
| Run tests | An explicitly named `test`, `run_tests`, `pytest`, `vitest` or `jest` tool. Shell contents are not inspected. |
| Other tool | A tool name outside the known categories. |
| Repeat | Consecutive calls within one session with the same tool name and argument hash. |
| Tool returns | A return record matched to a tool call. This does not prove success. |

Each live rule selects a musical role (keys, synth sequence, chords, groove or fill), instrument, pattern, phrase length, pitch, level and mute setting. Classical, Electronic and Hyperpop provide starting settings. The separate mixer controls bass, keys, synth, chords and drums; activity intensity controls how much repeated work develops the arrangement.

Default read events introduce keys; search events add a rising synth phrase; edits create held chords; commands add drums and melodic synth accents; named tests create a faster synth phrase. A repeat varies the source session’s existing part and adds a fill. A tool return remains silent by default. There is no claim that a generic shell command ran tests, or that a returned tool succeeded.

Parts enter on the shared beat and last one, two or four bars after their latest activity. They fade in their final half bar. Repeated events renew the part, with intensity growth limited to once per beat and three steps total. Musical notes follow the bass progression’s key. The same role from several sessions shares a musical voice. At most three melodic roles, one groove and one fill play together, capped at twelve note starts per subdivision and sixty-four scheduled audio sources.

The live readout reports which activity drives each part, how many sessions contribute and how many bars remain. Ending one session removes its parts while preserving other sessions. When the last session ends, all scheduled notes stop. Disconnection and unknown work state retain the same fail-silent behavior. Muting a mixer channel stops its sounding notes; per-rule edits affect subsequent notes.

Version 1 settings migrate field by field: untouched defaults become the richer defaults, while customized fields remain unchanged. Version 2 exports include roles, phrase lengths and mixer settings. Changing settings alone never creates a synthetic event or starts idle playback.

The log reader forwards metadata only. It hashes tool arguments locally and does not send prompts, arguments, output or reasoning text to the browser. Shell contents are not inspected to guess whether a command read, edited or tested a file.

## Signals not separately available

The current adapter does not infer permission waits, permission denial, tool failure, thinking intervals, subagent activity, notifications or error-specific turn endings. Their older saved mappings remain compatible, but their rows are labelled unavailable and do not offer active controls. Confirmed completion or cancellation of the last working session stops sound, regardless of any saved ending mapping.

Turbella supplies the optional visualizer only. Its hook stream is not used for music or authoritative work state. Its visual waveform is simulated; the dashboard’s Activity meter measures actual browser audio.

## Verification

Automated checks cover joining a working or finished session, cancellation, completion, older-turn completions, partial log writes, historical event exclusion, overlapping sessions, newly discovered sessions, per-session event identity and repeat history, lost connections, suspended audio, event bursts, sustained phrase expiry, harmonic pitch alignment, mixer muting, settings migration and preset validation. A local HTTP integration test appends isolated lifecycle and tool records and checks the emitted stream. Synthetic fixtures are test-only and never run in the dashboard.
