# Upstream provenance

`流畅输出` is a native DeepSeek Harness profile plugin adapted from the
streaming and scroll-follow engine in `Laplace-bit/dsh-smooth-stream`.

- Upstream repository: https://github.com/Laplace-bit/dsh-smooth-stream
- Reviewed commit: `97866e7143b844995bc7490f3a5a40f968fe9441`
- Upstream version at import: `0.3.4`
- License: MIT; the original copyright notice remains in `LICENSE`

Product-level changes in this fork:

- one lifecycle truth: Xiaozhuang plugin hot-plug, with no duplicate enable switch;
- no upstream updater, package-management UI, or separate plugin-settings card;
- thinking disclosure remains controlled by the user instead of being reopened by streaming state;
- the adaptive renderer also follows Teamwork, tool, context, command, retry and workflow rows;
- the existing manual-scroll release, reduced-motion and low-frame-rate guards are retained.
