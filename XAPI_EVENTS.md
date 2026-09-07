# SwiftPAL games — outbound event spec (xAPI style)

Every analytics event is one statement `{ verb, object, result, context }`, dispatched through the
**platform bridge** (`swiftpal-bridge.js`, shipped in every game):

```js
SwiftPAL.sendEvent(statement)   // routes to Android / iOS / web / electron automatically
```

On web the bridge delivers it as `postMessage({ source:"swiftpal", fn:"sendEvent", args:[jsonString] })`.
If the bridge is absent (standalone dev), the game falls back to
`postMessage({ type:"swiftpal:xapi", statement })`. The game's internal bus is named `GameBus`
(`window.GameBus`) so the global `SwiftPAL` name belongs to the bridge.

`verb` is the event name. `object` = what was acted on. `result` / `context` are optional-by-verb.
**Every game (book) emits the same 7 verbs** — the per-template variety lives inside `context.template`, never in new event names.

## Verbs

| verb | when | object | result |
|---|---|---|---|
| `activity_launched` | child taps शुरू करें on the start screen | `{type:"activity", id:<skill_code>}` | — |
| `screen_viewed` | a passive screen mounts (tutorial demo, meet, celebration) | `{type:"screen", id:<slide_id>}` | — |
| `question_started` | an answerable screen mounts | `{type:"question", id:<slide_id>}` | — |
| `question_answered` | every answer tap, right or wrong | option detail (below) | `{score:1\|0, attempt:n, is_correct:bool}` |
| `hint_used` | hint bulb tapped | `{type:"hint", id:"bulb"}` | — |
| `audio_replayed` | any replay chip tapped | `{type:"audio", id:<chip>}` | — |
| `activity_completed` | **only** when the child taps आगे बढ़ें on the celebration screen | `{type:"activity", id:<skill_code>}` | see below |

## `question_answered` object

```json
{ "type": "text" | "image", "id": "opt_2", "text": "क्या", "mediaUrl": "assets/Images/obj_x.png" | null,
  "ui_index": 2, "original_index": 0 }
```
`ui_index` = position shown after shuffle; `original_index` = position authored in the card.
`result.score` is 1 only on a first-attempt correct; `attempt` counts taps on this question.

## `activity_completed` result — answers to the open questions

```json
{ "completed": true, "progress": 100, "score": 0.78, "duration_ms": 184032 }
```
- `completed` is **always `true`** and `progress` is **always `100`** — the event exists only at the
  end and only on the button tap. There is no partial-completion variant of this event.
- It **no longer fires when the celebration screen appears** — a host that redirects on
  `activity_completed` will always let the child see the celebration and choose to move on.
- `score` = first-try accuracy across all answered questions (0–1, 2dp). It is **not** always 1.

## context (on every statement)

```json
{ "skill_code": "HI01H04_L02_S02", "lo_code": "HI01H04_L02", "medium": "hi", "session_ms": 9249,
  "question_id": "P2", "question_index": 10, "template": "ODD_ONE_OUT", "question_format": "mcq",
  "phase": "practice", "context_id": "...", "journey_id": "..." }
```
- `skill_code` is the **stable content id** of the book — it never changes per journey, so reusing the
  book elsewhere cannot conflict. The journey binding is the **host's**: launch the game with
  `?context_id=...&journey_id=...` (and optionally `&medium=`) and those values are echoed into every
  statement's context.
- `question_format` values: `mcq`, `timed_mcq`, `build`, `drag`, `tap_count`. `template` is the exact
  screen template (e.g. `TAP_LETTER_BY_SOUND`) for finer analysis.

## Noise control

The old raw `swiftpal:signal` firehose (30+ internal signal names) is now **dev-only** (`?dev=1`).
Production hosts receive only the 7 verbs above, identically shaped from every book.
`swiftpal:proceed` (existing next-module message) still fires after `activity_completed` for backward
compatibility; `swiftpal:lesson_complete` (validator report) also moved to the button tap.
