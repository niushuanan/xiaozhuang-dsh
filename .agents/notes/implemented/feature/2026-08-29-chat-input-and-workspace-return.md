# Agent Note: Capability-scoped Chat input and Workspace return

Status: implemented

English | [中文](2026-08-29-chat-input-and-workspace-return.zh.md)

## Problem

Native Chat needs ordinary question-answering inputs such as images, text files, and current public information without inheriting a Workspace or local execution authority. The work composer also needs its existing file and folder reference path to remain usable, and returning from Chat to Agentic Coding needs a predictable Workspace instead of an unrelated recent selection.

## Decision

Chat renders the same composer add seat as work sessions. Its menu accepts supported images and user-selected text, Markdown, table, configuration, log, and source files. Text files are inserted into the editable draft; image admission retains the existing model and attachment checks. Chat does not expose Workspace references, commands, Skills, access modes, or project runtime context.

The shipped `chat` preset mounts only the public Web search and fetch consumer. The composer shows a compact status icon beside the add button to make that capability visible, while the model decides when a question needs current or source-backed Web access. This status is not a separate per-message mode and does not imply local browser or machine control.

Work sessions pass the live reference trigger through the conversation add-slot owner. **Files and folders** opens the existing Workspace reference picker at the current selection instead of rendering a permanently disabled row.

Starting Agentic Coding without an explicit Workspace keeps the current work Session's Workspace when one exists; otherwise it selects the first Workspace in the visible browser order. Startup restoration may still use recency because it restores prior navigation rather than answering an explicit mode switch.

The standalone Pure Chat export enables only the dedicated launcher row and carries the launcher, composer add menu, shared conversation surfaces, and shipped Chat preset from their current repository paths. This keeps the independent install payload aligned with the product instead of exporting the removed legacy preset path.

## Alternatives considered

**Keep Chat text-only and offline.** This preserves the narrowest capability set but blocks common user tasks that need an attachment or current public information even though neither requires project authority.

**Expose work commands, Skills, or Workspace references in Chat.** This makes the two modes look similar but erases the authority distinction that makes Chat safe and understandable.

**Add a Web toggle that changes per-message behavior.** A second state makes the user predict whether a question needs search. The visible always-available status communicates capability without creating a mode the user must manage.

**Restore the most recently active Workspace when leaving Chat.** Recency can select a folder far below the current browser context. The first visible Workspace is deterministic and matches the user's current navigation order.

## Consequences

Chat users can upload ordinary files and images and receive Web-backed answers while the mode remains unable to inspect a Workspace or operate the machine. Work users can open files and folders from the composer again. Switching to Agentic Coding lands on the current work context or the first visible Workspace, so a stale recent folder cannot capture the transition.

Focused component and service tests cover the Chat menu, Web capability marker, live reference trigger, and Workspace fallback. The assembled product path verifies actual file intake, a public Web search tool round, the file-and-folder picker, and the Chat-to-Agentic Workspace selection.
