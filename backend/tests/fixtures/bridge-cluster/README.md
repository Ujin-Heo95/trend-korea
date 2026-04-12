# Bridge-cluster regression fixtures

Historical bridge-cluster incidents captured as JSON for v8 `postClustering.test.ts`
regression harness. Each file holds a set of posts that *previously* collapsed into
a single bad cluster under legacy IDF+entity gating. v8 k-NN clustering
(`cos >= 0.78` + `cross-source >= 2` + `max-size=50`) must keep them separate.

## File format

```json
{
  "name": "short incident label",
  "source_ref": "lessons_issue_bridge_cluster.md or git sha",
  "description": "why this used to bridge",
  "expected_clusters": 2,
  "posts": [
    {
      "id": 1,
      "title": "…",
      "source_key": "dcinside",
      "channel": "community",
      "embedding": [/* optional 768-dim; if omitted use title trigram hash */]
    }
  ]
}
```

See `lessons_issue_bridge_cluster.md` in global memory for the root-cause
analysis of the 6 stale-card incidents that motivate this harness.

## TODO

Populate with the 3 historical cases referenced in the v8 plan
(`~/.claude/plans/jiggly-watching-pixel.md`, Verification §3). Until then,
v8 k-NN relies on production observation alone for regression confidence.
