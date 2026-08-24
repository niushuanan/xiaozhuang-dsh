# @deepseek-ai/dsh-session-log-export

English | [中文](README.zh.md)

Web conversation export control. The Session Header's `Export` action opens two choices ordinary users can understand: `Export text record`, preserving the existing Session ZIP, and `Export conversation image`, which lays out the complete exchange as one long PNG. The Host half still registers `/export`; the browser half owns the menu, download controller, and shared result modal. ZIP generation, raw JSONL/zstd reads, descendants, attachments, backpressure, and HTTP error semantics remain owned by the [ApiProxy download implementation](../../host/apiproxy/README.md).

Image export first loads every available history page for the current Session, then selects only human messages, steering messages, and assistant answer text from the conversation data. Reasoning, tool calls, system context, command rows, error cards, and usage telemetry never enter the image; an in-progress assistant text prefix is retained as the last answer. A dedicated canvas creates the single long image instead of screenshotting the visible DOM, so collapsed or hidden reasoning cannot leak into the file.

## Command contract

| Input | Result |
|---|---|
| `/export` | Record a human-command lifecycle; the submitting browser receives the local execution acknowledgment and downloads `GET /api/session.export?sessionId=<id>&includeDescendants=true`. |
| `/export <path>` | Return an error. Browser downloads choose their destination through the browser's ordinary download behavior. |

The command is mounted only by the Web bundle. The local `command/executed` acknowledgment triggers the slash download only after a successful `/export` result in the browser that submitted it; other tabs still render the durable command row without repeating the browser side effect. The Header menu's `Export text record` path calls the same ZIP controller: it issues a `HEAD` preflight, then hands the GET URL to the browser download manager without buffering the ZIP in JavaScript. `Export conversation image` reads the already-bound Session in this browser and pages older history when necessary. Both paths share in-flight collapsing, cancellation on plugin disposal, preparation-error handling, browser save behavior, and the same Modal.

The Host download endpoint flushes a live root Session before `readRaw`, so a slash-triggered ZIP includes the `command/run` and `command/done` pair whose acknowledgment started the download. Cold persisted Sessions require no flush.

The modal reports format-specific preparation, download start, or failure. Closing it does not cancel an in-flight export and does not reopen it when that operation later settles. One Session admits one active export at a time; repeated gestures share that operation.

## Composition

```yaml
- id: session-log-download
  name: '@deepseek-ai/dsh-session-log-export'
```

The Web bundle mounts the package beside `dsh-host-apiproxy`, `dsh-commands`, `dsh-client-ui-commands`, and `dsh-client-ui-conversation`. The package contributes its button and modal to the right-aligned `conversation.session.header.utilities` list, independently of the title-adjacent mode, Subagent, and Task entries in `conversation.session.header.actions`; Trajectory carries no export control.

## Model Experience

### Human `/export` control

#### What the model sees

Nothing. `/export` stays on the human-command plane, and the ZIP download does not enter model history.

#### Token effect

Zero. The command creates no model turn.

#### KV Cache effect

None. The log-only command lifecycle and browser download do not change the derived request prefix.

## Known Limitations and Deferred Work

- The download endpoint requires a persistence backend with a per-Session raw artifact. The shipped JSONL backend supports plaintext and zstd artifacts; SQLite export is not included in this change.
- Both formats are browser downloads, not Host-path writers. The browser chooses the local destination; no Host path or native folder action is returned.
- The preflight reports failures found before ZIP streaming starts. A descendant or attachment failure after the browser accepts the GET is reported by the browser download manager, not by the modal.
- The conversation image contains the current Session only, not descendant Sessions. Image attachments are represented by the literal `【图片】` placeholder; their source pixels are not embedded in the long image yet.
