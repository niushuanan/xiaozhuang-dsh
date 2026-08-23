# @deepseek-ai/dsh-client-ui-plan

English | [中文](README.zh.md)

Plan-mode session status, a pure browser surface plugin. The browser half contributes the same low-emphasis action to `conversation.hero.actions` while a blank session uses the Hero layout and to `conversation.session.header.actions` after the session becomes active; the node half is an empty apply (the roster row). Plan behavior itself — the `/plan` command, the boundary-or-idle-committed `plan/mode` state, the `plan` projection unit, and the policy section — is owned by [`@deepseek-ai/dsh-plan-mode`](../../plan/plan-mode/README.md), composed independently on the host roster.

Plan mode is entered through the `/plan` command path: users can choose Plan from the composer's `+` Command menu or type `/plan`, while this package renders no inactive control. While the host-computed `plan` projection's effective target is plan mode (`pending ? !active : active` — a folded host value, not client optimism, so an arriving frame corrects the status either way), the blank-session context row or active session header shows an unboxed "Planning mode ×" text action, which executes `/plan off` through `command.execute`; otherwise it renders nothing. The composer keeps only its task input controls, while the textarea placeholder still switches to the plan-task hint — "describe your task to generate plan", localized through ui-conversation's `conversation` locale namespace (the `placeholder.plan` / `hint.plan` keys) and shared verbatim with the claimed `/plan` command hint (rendered from the same projection; owner-supplied placeholders win).

The top-level action carries the accessible description "Planning mode is on, press to turn it off". Admission failures (`matched: false`, business errors, transport faults) remain available to assistive technology and as the action title; the status stays until the projection confirms the exit.

The model exits plan mode through the stable `exit_plan_mode` tool; its plan review uses the composed Web question channel.

## Model Experience

Indirectly, through the `/plan off` command line the top-level action dispatches: `@deepseek-ai/dsh-plan-mode` owns the model-visible policy section, the exit-tool schema, and the logged state that line drives, while this package only renders the projection and sends what a user could equally type.

#### KV Cache effect

Entering or leaving plan mode changes the active `plan:policy` system-prompt section and therefore the request prefix; the top-level status itself adds no prompt content.

## Known Limitations and Deferred Work

- **Plan mode is guidance, not an execution sandbox** — deployments that require enforced read-only planning must compose the independent sandbox and approval policies.
- **No inactive plan control** — entry uses the shared Command source; a session with the capability but inactive mode shows no plan status in either top-level row.
