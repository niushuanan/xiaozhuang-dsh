---
kind: upgrade-guide
description: "The legacy vision plugin is removed and built-in DeepSeek models retain their native image capability when relabeled."
---

# Native image input

## Change

The legacy `vision-local` plugin and `image_vision` tool are removed. DSH sends image attachments directly to image-capable models. A configured built-in DeepSeek model inherits its default input capabilities when `inputModalities` is omitted; an explicit override still takes precedence.

## Migration

1. Remove `vision-local` insertions and overrides from your profile's `cordis.patch.yml`.
2. Remove `@deepseek-ai/dsh-vision-local` from custom dependency lists. Keep existing user attachments and session history.
3. For DeepSeek V4.1 (`deepseek-flash`), omit `inputModalities` to inherit native support or set it to `[text, image]` explicitly.
4. Restart DSH, attach an image in a new V4.1 conversation, and confirm that the model reads it directly.
