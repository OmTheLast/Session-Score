# How coding actions shape the score

This is the proposed musical vocabulary for Session Score. A preset chooses the instruments, notes and beat. The action map tells it when to change a part. For example, a file edit can add a low synth in Electronic or a cello in Classical. Both listeners hear the same idea: the agent has started making a change.

## Live today

The Electronic player starts its backing on a turn, introduces a hook when a tool starts, varies the last note on a consecutive repeat, and plays an ending on a stop. A tool return refreshes the activity timer. It has no separate melody. After 15 seconds without activity, the backing rests. The ten audition clips use scripted events.

## Proposed action map

### Which part plays?

Use the reported tool name to pick a part when a call starts. These names are examples. Each agent adapter needs its own list of exact names. An unfamiliar name gets the general tool sound.

| Tool action | Musical part | Electronic example |
| --- | --- | --- |
| Read or inspect | Play a light phrase high in the arrangement. | A two-note glass pluck. |
| Search or browse | Add a moving pattern for one bar. | A rising three-note arpeggio. |
| Write, edit or patch | Bring in a lower, fuller voice for one bar. | A low synth doubles the bass rhythm. |
| Run a command | Add a rhythmic figure for one bar. | A syncopated kick and rim pattern. |
| Other tool starts | Play the preset's main hook once. | The existing E–G–B phrase. |

Treat an explicitly named test tool as a command. Codex commonly exposes several activities through one shell tool. When the tool is just `exec_command`, use the command part whether the underlying command reads a file, runs a test, or builds the project. Input hashes let us detect repetition without revealing what the command says.

### What happened to the action?

| Signal | How to recognize it | Musical instruction |
| --- | --- | --- |
| Turn starts | `turn` | Start the groove on a downbeat. Clear the previous turn's repeat history. |
| Tool returns normally | `tool` with `ok` | Let its figure finish. Keep the beat moving without adding a success jingle. |
| Same action repeats | Consecutive tool starts within one turn share a tool name and a nonempty input signature. | Keep that part and melody. Split its final note into two pulses. |
| Tool failure or agent error reported | `tool_fail`, `error`, or a tool event carrying `error` | Add a short tense interval on the next beat. Release it after one bar. |
| Permission requested | `permission` with `waiting` | Drop the drums and hold a quiet chord for up to one bar, then rest. Resume on new tool activity. |
| Permission denied | `permission` or `tool` with `denied` | Cut the held chord. Leave one beat of space. |
| Thinking time reported | `think`, sometimes with `dur_ms` | Swell a pad once, capped at one bar. This is a cue on receipt of the event. |
| Subagent activity | `subagent` | Let a second instrument answer once. The stream gives starts and stops the same event kind and status. |
| General notification | `notification` | Silent by default. Reserve the distinctive pause for permission requests. |
| Turn stops | `stop` with `ok` | End on the current chord and rest. Turbella can also emit this at context compaction. |
| Turn stops with an error | `stop` with `error` | End on a suspended chord and rest. |
| No new activity | Local timer | Let existing notes decay. Rest after 15 seconds. An idle stretch alone says nothing about the outcome. |

### What takes priority?

- Keep a fixed tempo. Place musical changes on the next eighth note. Multiple calls on the same subdivision may share one audible accent.
- Track every event in order, even when the listener hears only one accent. A new turn clears old state. A stop ends its turn even when a tool cue arrives in the same batch.
- Within a turn, a permission pause takes precedence over ordinary tool parts until activity resumes. A reported failure takes precedence over a repeat accent on the same subdivision.
- Keep three controls separate in each preset: instrument for each tool family, variation for each outcome, and volume or mute for each part. Muting a sound should preserve the underlying action history.

## First listening test

Use a scripted read → edit → same edit → permission request → stop. Listen without looking. Can you tell when the agent started changing a file, when it repeated the edit, and when it needed you? Adjust one part at a time.

The stream supplies event kinds, statuses, tool names, durations and hashes. A shell return in Codex can lack an exit code. Only play the failure cue when the stream supplies a failure signal. [Turbella event contract](https://github.com/NakliTechie/turbella/blob/bf4809a/docs/PLUGINS.md) · [Codex adapter](https://github.com/NakliTechie/turbella/blob/bf4809a/src/agents.js)
