---
name: hk-risk-checklist
description: 港股交易前核对流程：核验市场身份、货币、交易单位、流动性与组合敞口。
---

# Hong Kong trading review

Apply this checklist to the proposed trade and the user's existing positions. Reply in the user's language. Record missing information explicitly; do not substitute guessed values or treat a missing account response as an empty account.

1. Establish the evidence. Use `routing_get` to identify the active provider, then the installed `hk_get_ticker`, `hk_get_klines`, `hk_get_news` and `hk_get_fundamentals` tools as relevant. State the instrument, currency, data source and observation time. Check primary announcements for events that affect the proposed holding period.
2. Establish the account position. Start with `holdings_list`; when execution depends on live funds or available quantity, confirm through the installed account tools. Distinguish the local holdings ledger from broker account data. Include existing orders and correlated holdings in the proposed exposure.
3. Confirm market-specific execution details. Verify the listing and canonical symbol, quote and account currencies, current trading session, trading lot and odd-lot handling, permitted order types and settlement availability with the active broker or exchange source. When a plan crosses account currencies, show the conversion source and timestamp and include its effect on exposure; do not assume a lot size from another Hong Kong security.
4. Write a falsifiable hypothesis and its observable invalidation conditions. Describe entry conditions, intended quantity, exit conditions and both continuation and adverse scenarios. Relate the proposed size and stressed loss to the user's stated capital and risk budget; ask for missing inputs instead of inventing a default risk allowance.
5. Check feasibility. Evaluate current liquidity, spread, possible slippage, fees and any financing or currency conversion needed. Explain how a gap, unavailable liquidity or a relevant scheduled event would affect the planned exit. A chart signal by itself is not a complete review.
6. Produce the review. Return pass, conditional pass or fail, followed by the main evidence, unresolved items, intended exposure, invalidation conditions and contingency plan. A review result does not authorize a transaction.
7. Keep execution explicit. Orders and cancellations start with `dryRun=true`. Preserve `liveTrading=false` until the connector is explicitly configured for live use and the user authorizes the specific operation through the host approval gate. Do not use scripts, alternative tools or delegation to bypass that gate. Report simulation results as simulated, and record an operation in the trading journal only after its actual outcome is known.
