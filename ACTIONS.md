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

The bass catalogue contains ten named four-bar melodies: Original, Low tide, Descent, Slow climb, Heartbeat, Broken steps, Wide space, Question and answer, Undertow and Homecoming. All retain the same harmony, register and even-subdivision grid. Rotation advances once per four-bar phrase during verified work; hold mode repeats the selected melody. Selection and mode edits wait for the next four-bar boundary. A new working period starts from the selected melody. Keys and command synth accents follow the current bass pitches. No melody selection starts audio by itself.

Each live rule selects a musical role (keys, synth sequence, chords, groove or fill), instrument, pattern, variation, phrase length, pitch, level and mute setting. Classical, Electronic and Hyperpop provide starting settings. The separate mixer controls bass, keys, synth, chords and drums; activity intensity controls how much repeated work develops the arrangement.

Default read events introduce keys; search events add a rising synth phrase; edits create held chords; commands add drums and melodic synth accents; named tests create a faster synth phrase. A repeat varies the source session’s existing part and adds a fill. A tool return remains silent by default. There is no claim that a generic shell command ran tests, or that a returned tool succeeded.

Parts queue until the next bar and last one, two, four or eight complete bars from that boundary. Steady uses one motif, Subtle two related variants, and Evolving three variants with more rhythm changes. Further real events queue variation changes at most once per bar; there is no automatic idle variation. Older version-2 settings default to Subtle. Renewals and repeat variations respect phrase boundaries; queued parts are labelled in the live readout. Levels build gradually and ease down toward phrase endings. Held chords have longer attacks and releases. Repeated events renew the part, with intensity growth limited to once per beat and three steps total. Keys follow the bass motif; synth lines use nearby chord tones, without automatic octave jumps. Chords retain common tones across changes. Command synth accents align with bass accents and yield when another melodic part is present. The same role from several sessions shares a musical voice; the oldest active contribution keeps that voice instead of each new event replacing it. At most three melodic roles, one groove and one fill play together, capped at twelve note starts per subdivision and sixty-four scheduled audio sources.

A single variation inventory lists the ten bass descriptions and every live rule’s current role and three variant descriptions. It reflects edits and dims variants outside the chosen mode or muted rule. Variants describe the musical role; sparse/held patterns and percussion instruments can limit the differences heard.

The live readout reports which activity drives each part, how many sessions contribute and how many bars remain. Ending one session removes its parts while preserving other sessions. When the last session completes normally, queued notes are cancelled and already sounding notes fade for at most 0.8 seconds. Idle heartbeats do not restart or truncate that fade; a new working turn clears the old tail. Disconnection and unknown work state retain the same fail-silent behavior. Muting a mixer channel stops its sounding notes; per-rule edits affect subsequent notes.

The scheduler preserves the original beat grid across delayed callbacks, skips missed ticks, and applies tempo edits at a bar boundary. It does not restart the clock at the current wall time. Cancellation, disconnect and unknown work state stop immediately. Normal completion uses the bounded fade described above.

Version 1 settings migrate field by field: untouched defaults become the richer defaults, while customized fields remain unchanged. Version 3 exports include roles, phrase lengths and mixer settings. Version 2 action lengths double once on upgrade (1 → 2, 2 → 4, 4 → 8); version 3 lengths are preserved. New presets use two bars for starts and repeats, four for read/search/test/other actions, and eight for edits and commands. Shorter lengths remain available manually. Changing settings alone never creates a synthetic event or starts idle playback.

The log reader forwards metadata only. It hashes tool arguments locally and does not send prompts, arguments, output or reasoning text to the browser. Shell contents are not inspected to guess whether a command read, edited or tested a file.

## Signals not separately available

The current adapter does not infer permission waits, permission denial, tool failure, thinking intervals, subagent activity, notifications or error-specific turn endings. Their older saved mappings remain compatible, but their rows are labelled unavailable and do not offer active controls. The last working session’s verified ending determines release or immediate stop, regardless of any saved ending mapping.

Turbella supplies the optional visualizer only. Its hook stream is not used for music or authoritative work state. Its visual waveform is simulated; the dashboard’s Activity meter measures actual browser audio.

## Verification

Automated checks cover joining a working or finished session, cancellation, completion, older-turn completions, partial log writes, historical event exclusion, overlapping sessions, newly discovered sessions, per-session event identity and repeat history, lost connections, suspended audio, event bursts, sustained phrase expiry, harmonic pitch alignment, mixer muting, settings migration and preset validation. A local HTTP integration test appends isolated lifecycle and tool records and checks the emitted stream. Synthetic fixtures are test-only and never run in the dashboard.
