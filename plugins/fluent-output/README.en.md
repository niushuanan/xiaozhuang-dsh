# Fluent Output

`Fluent Output` is the native conversation-rendering plugin for the Xiaozhuang DeepSeek Harness Web profile.

It adaptively reveals chunked model output, keeps Markdown and Agent-owned tool or Teamwork rows on one visual rhythm, follows the streaming tail only while the reader remains at the bottom, and immediately yields when the reader scrolls upward.

The only enable state is **Settings → Xiaozhuang Plugins → Fluent Output**. Hot-unplug restores the built-in Harness renderer. Thinking disclosure remains user-controlled, reduced-motion is honored, and offscreen commits are guarded under low frame rate.

The engine is adapted from the MIT-licensed `Laplace-bit/dsh-smooth-stream`. See `UPSTREAM.md` and `LICENSE` for provenance.
