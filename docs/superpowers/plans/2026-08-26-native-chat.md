# Native Chat Implementation Plan

English | [中文](2026-08-26-native-chat.zh.md)

**Goal:** Add an immediate, folder-free, tool-free native chat flow without building a second conversation product.

**Spec:** [`docs/superpowers/specs/2026-08-26-native-chat-design.md`](../specs/2026-08-26-native-chat-design.md)

## 1. Pin the product contracts with focused tests

Add targeted tests for the two sidebar actions, `agentPreset: chat` create propagation, blank-chat reuse, the dedicated Chat history group, and the conversation's folder-free simplified posture. Run them red before implementation.

## 2. Add the durable chat capability boundary

Ship an internal `chat` preset containing only a complete conversational persona. Extend the client Session create face to forward the Host's existing agent-preset option and preserve the confirmed preset in the immediate list row.

## 3. Compose the native chat plugin and UI posture

Declare a sidebar primary-action slot, rename New Session to Start work, and mount `ui-chat` as the Start chat contributor. Reuse a blank Chat Session or create/open one with race deduplication. Project Chat Sessions into their own history group and remove Workspace, preset, access, and add-command controls while retaining the existing conversation and model surfaces.

## 4. Document and verify the real path

Update package/root bilingual READMEs, the implemented Agent Note, pairing records, and `PROJECT_CONTEXT.md`. Run focused tests, type checks, and builds, then use the local web product to start a chat, send a message, return through history, and confirm a normal Work Session remains unchanged before committing and pushing.
