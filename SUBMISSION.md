Category: Builder → Intelligent Contracts

Title: ClockMesh: Consensus timing bounds for custody handoffs

Notes / Description:

ClockMesh transfers contract-native custody rights only when every timeline consistent with a published timing report meets a two-to-six-second handoff window. Leader and validators independently fetch the full commit-pinned report, verify SHA-256, and extract exact signed endpoints for three event pairs. Validators audit directions, endpoints, missing pairs, and rejected drafts against the full prose. Shortest-path closure derives tight indirect bounds. Disconnected pairs stay unbounded, and a negative cycle blocks all claims with a minimal conflict. A signed claim changes the holder of an eligible right and rejects replay. The repository includes four synthetic cases and 27 tests, including exhaustive comparison over 21,952 interval combinations. The fixtures demonstrate native rights under declared timing assumptions.
