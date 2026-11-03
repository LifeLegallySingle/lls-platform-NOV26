# LLS event contract

`event.v1.schema.json` is the single source of truth for events moving between WordPress (HUB + product plugins) and Cloudflare Workers (SLEE today; more Worker apps later).

**Change rule:** additive changes only (new optional attributes/types). Breaking changes → `event.v2.schema.json` and both versions accepted during transition.
