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

## Cases

| File | Incident | Expected post-filter clusters |
|---|---|---|
| `case-01-knownorgs-bridge.json` | KNOWN_ORGS one-sided pass-through merging unrelated 삼성 events | 2 |
| `case-02-union-find-transitive.json` | DSU transitive bridge via generic intermediate post | 2 |
| `case-03-anchor-symmetry.json` | Anchor-entity asymmetric subset match across unrelated games | 1 (one topic dropped by cross-source filter) |

Each fixture asserts: after `clusterPosts` + `filterMultiSourceClusters`,
the surviving cluster count equals `expected_clusters`. Loosening the v8
cos threshold below 0.78 or removing the cross-source gate breaks these.
