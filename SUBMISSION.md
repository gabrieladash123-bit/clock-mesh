Category: Builder → Intelligent Contracts

Title: ClockMesh: Consensus timing bounds for custody handoffs

Notes / Description:

ClockMesh transfers contract-native custody rights only when every timeline consistent with a timing report meets a two-to-six-second handoff window. Leader and validators independently fetch the full commit-pinned report, verify SHA-256, and select approved sentences for three event pairs. The parser derives exact signed bounds from literal text. Validators require exact agreement and separately audit approvals, missing pairs, abstentions, and rejected drafts. Shortest-path closure derives tight indirect bounds; a negative cycle blocks claims. Signed claims change eligible holders and reject replay. Four synthetic reports and 29 tests cover the rules, including exhaustive comparison over 21,952 interval combinations. The fixtures demonstrate native rights under declared timing assumptions.
