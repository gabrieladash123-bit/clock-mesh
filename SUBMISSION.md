Category: Builder → Intelligent Contracts

Title: ClockMesh: Consensus timing bounds for custody handoffs

Notes / Description:

ClockMesh transfers contract-native custody rights only when every timeline consistent with a timing report meets a two-to-six-second handoff window. Leader and validators independently fetch the full commit-pinned report, verify SHA-256, and select approved sentences for three event pairs. The parser derives signed bounds from literal text. Validators require exact agreement and separately audit approvals, missing pairs, abstentions, and rejected drafts. Shortest-path closure derives tight indirect bounds; a negative cycle blocks claims. Signed claims change eligible holders and reject replay. Four StudioNet scenarios verified 30 finalized receipts: all slots eligible, only two eligible, inconsistent timing, and unresolved timing. The repo includes 29 tests and synthetic reports, which demonstrate rights under declared timing assumptions.

Evidence: [Contract source](contracts/clock_mesh.py) · [StudioNet explorer](https://explorer-studio.genlayer.com/address/0x4cbC8Ef6f345d696b48996A844F03df687465F55) · [Verified receipts](proofs/README.md)
