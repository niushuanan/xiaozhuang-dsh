# dsh-client-ui-agent-preset

English | [中文](README.zh.md)

The agent-preset surfaces: a General-settings row choosing which [preset](../../preset/agent-presets/README.md) new sessions are composed from, a chip on the new-session screen choosing the next session's, a next-turn switcher in the session header, and a settings section that manages the roster — copy, delete, default, and the way into a preset's own files.

## The default for new sessions

The General row sets only the deployment default. It does not silently rewrite existing conversations; those use their own header control when the user wants a different composition.

## The new-session chip

A second surface, beside the workspace picker on the new-session screen. It sits there rather than in the composer because that is where the choice is still open: a control that spends most of its life disabled belongs on the screen where it still works.

The chip opens on the deployment default and its pick is *staged* — the screen precedes the session it would apply to. The stage reaches a session when one becomes current and is still blank, which covers both the session the workspace connect created and the blank one it reused; riding along on `sessions.create` would miss the second. It is spent on first use, so the next new session opens on the default again, exactly like the workspace picker beside it.

A session that has started is left to the header control. The new-session stage is still spent only by a blank session, preserving its one-screen, one-next-session meaning.

## The session-header switcher

A third surface, beside the session title: the preset THIS session runs and a menu for changing the next turn's composition. It reads the current preset from the session summary and resolves every display name against the same roster the General row reads.

An idle session switches immediately. A pick made during an active turn is kept in a per-session plugin store and labeled "Next turn"; the current task finishes under its original tools and prompt, then the next session-list transition to idle commits the queued pick. The Host claims an idle maintenance phase for the re-link, which also holds newly waking input behind the switch. If another maintenance task wins the boundary, `agent-preset-locked` keeps the pick queued for the next idle update instead of turning it into a user-visible failure.

The committed `agent-preset/selected` owner event folds the new id into every tab's shared summary and clears matching queued state. The initiating tab may already have applied the RPC echo, and the merge is idempotent.

## What it reads and writes

Options and the current default both come from one `agentPreset.list` call. The roster already reports which id a session with no explicit choice gets, so the row needs no settings-schema introspection; the write targets the `agent-presets` settings namespace's `default` field, which is what the host resolves at creation.

A locally authored preset is exactly as privileged as the plugins it names, so the list marks `user` rows rather than presenting every preset as shipped and vetted.

Preset files publish one unlocalized `name` and `description`, which Web uses for every `user` row and unknown `system` row. For the four shipped ids (`standard`, `code`, `minimal`, and `cordis`), Web resolves both fields from its active locale only when the roster marks the row `system`; an identically named `user` preset keeps its file metadata.

The row re-reads on `settings/changed` for its own namespace and on `connection/reset`: the roster is a live directory and the default is a settings field, so an external edit or a reconnect can both move it.

## The management section

A fourth surface, its own settings page (`settings.section` id `agent-presets`, ordered after Models — choosing a model is routine, composing an agent is the deployment-shaping act behind it): the roster as cards, a copy dialog as the only way a preset is created, and a read-only viewer over the shipped compositions.

The browser edits no composition text. Editing YAML in a web textarea was a weak surface (no completion, no highlighting, no diff), so a new preset is a host-side copy of an existing one — the dialog collects an id (it becomes the directory name, which is why it must be named up front and cannot change later) and an optional display name, and `{ from, id, name? }` is all that crosses the wire. Everything else — description, composition, skills — is edited in the preset's own files, and the page's other job is getting the user TO those files: the copy completes by opening the new directory, and every custom row keeps a location action. Where the host has no desktop opener (`hasDocument: false` on the roster; remote and container deployments), the same actions answer the directory as text on the row instead of offering a button that would spawn into nothing.

A preset publishes its own description, of any length, and the grid sizes every card row alike — so an unbounded description would set the height of the whole roster. Cards clamp it to four lines and offer the rest in a tooltip, attached only while the text is actually cut off. The clamp is CSS, so the whole description stays in the accessibility tree whatever the card shows.

A shipped preset opens in the read-only viewer. It is the known-good composition a copy starts from, so reading it is the point; it offers no location and no delete — its install is overwritten by upgrades and is not the user's to manage. The intro carries the guidance a create button used to imply: duplicate an existing preset and make it yours, or let the agent draft one in Creator mode.

Beside copying sits the conversational entry: when the roster carries the self-referential `cordis` preset, a dashed add-card (the Models page's affordance) stages it and starts a new session — the section closes the settings panel through the shell's owner-prop `close` and the new-session chip's own applier composes the blank session the workspace flow produces. The seat keeps a late roster load from regressing the display: staged pick first, then the composition the current session already carries, then the deployment default.

The dialog mirrors the host's own containment rule (`[a-z0-9][a-z0-9-]*`) and refuses a name already in use — a copy never overwrites. Both checks are conveniences: the host re-applies them and its answer is what the dialog reports on failure.

Deleting removes the preset directory. A live session already linked to its standing composition keeps running, but the deleted preset can no longer be selected or reconstructed after process restart.

A roster row carrying `broken` (the host's shape check found the composition missing or unloadable) renders as a marked card: red border, a "Failed to load" badge (what discovery observed, not a claim that the files are damaged — the usual cause is a composition the user just edited or deleted), the reason verbatim, the body disabled — it cannot become the default — and duplication disabled, since a copy of a broken preset is another broken preset. A broken custom row keeps its location and delete actions, because the files are where it gets fixed and deleting is how a ghost directory (composition deleted by hand, directory still blocking the id) is cleared; a broken shipped row withholds the viewer too — there is no readable composition to show. The two pickers (the General row and the new-session chip) drop broken presets entirely: they choose the NEXT session's composition, and offering one that cannot compose would only defer the failure to the session start.

Setting the default writes the `agent-presets` settings namespace, which the host exposes to configuration clients ([`dsh-apiproxy`](../../host/apiproxy/README.md) keeps an explicit allowlist — a namespace outside it makes a picker move and then silently forget).

`agentPreset.read`, `copy`, `openDocument`, and `remove` are loopback-pinned ([`dsh-client-connection`](../connection/README.md)): a composition names the plugins a session runs, so reading one is reconnaissance, and the rest manage the roster and drive the host desktop. `agentPreset.list` is not — it carries ids, trust, and the two path-free capability flags, and a LAN client's picker needs it.

## When the surfaces are absent

A deployment that composes no presets answers with an empty roster, and the row, the chip, the label, and the section all render nothing — every session then shares the host composition, and there is nothing to choose between or manage. A deployment that configures no writable root answers `authorable: false`, and the section stays a read-only browser: the shipped compositions still open in the viewer, but every copy action is disabled with the reason as its tooltip rather than offering a dialog whose create always fails.

## Model Experience

Indirectly, through the selected preset's tools, skills, commands, and prompt sections ([`dsh-agent-presets`](../../preset/agent-presets/README.md)) on the next turn of the selected session.

#### KV Cache effect

Switching an existing session changes its model-visible prefix on the next turn, so reuse across that composition boundary is not expected; the active request is left untouched, and changing the deployment default never touches a running session.

## Known Limitations and Deferred Work

- **A preset without metadata is listed by id** — display text is optional, and a copy given no name deliberately falls back to its directory name rather than presenting itself identically to its source.
- **A revealed path is display text, not a link** — where the host has no desktop opener the row shows the directory to copy by hand; the browser cannot open a host filesystem location itself.
- **Composition edits are invisible to the page** — the files are edited outside the browser and nothing on the wire announces a file change, so the roster re-reads on its own actions, `settings/changed`, and `connection/reset`, not on every disk edit.
