# ClockMesh

ClockMesh releases contract-native custody rights only when **every** timeline
compatible with a published timing report satisfies the handoff window.
An issuer pins a full report and names a recipient; anyone can resolve it.
The recipient can claim only the slots whose differences are proven to lie
entirely within the inclusive window of two to six seconds.

The three slots represent B−A, C−B and C−A. The leader and validators each
fetch the full commit-pinned report and verify SHA-256, then independently
select the approved source sentence for each pair or mark it absent or unresolved.
The parser derives order and integer endpoints from literal timing clauses.
For example, “B occurs two to three seconds before C” always yields C−B = [2,3].
Supported clauses use before/after or an explicit named range with a later/earlier
event. Validators require exact agreement on all three selections and separately
audit their approval status against the full prose, including rejected drafts.
Malformed model output and fetch errors leave resolution uncommitted.

The agreed rows feed a bounded simple temporal network. For an interval
[l,u] on j−i, the two directed bounds are i→j with u and j→i with −l.
Shortest-path closure gives tight bounds; a negative diagonal means no
feasible timeline. In that case all three rows form a minimal conflict:
each individual interval is nonempty, and any two distinct pairs form a
tree. A missing direct edge can still acquire exact bounds transitively;
a disconnected pair remains unbounded. See [Dechter, Meiri and Pearl](https://www.sciencedirect.com/science/article/pii/0004370291900066)
for the classical temporal network model.

| Report | Result | Eligible slots |
|---|---|---|
| Transitive | Indirect C−A bound [4,6] | 0, 1, 2 |
| Partial | B−A may be one second | 1, 2 |
| Inconsistent | No compatible timeline; minimal conflict 0, 1, 2 | None |
| Unresolved | Approved B−C endpoints cannot be normalized | None |

`claim(slot)` transfers the stored holder from issuer to recipient. It rejects
other signers, repeated claims and unproven slots. Rights exist only inside
this contract. Synthetic reports demonstrate constraint reasoning and do not
establish that an external event occurred or that a service was delivered.
The report publisher controls the input assumptions.

```sh
pip install -r requirements-dev.txt
genvm-lint download --version v0.2.16
genvm-lint check contracts/clock_mesh.py
python -m pytest -q
```

Tests compare closure with exhaustive integer timelines for bounded models,
check native holder transitions, and replay validator callbacks with divergent
rows and semantic audit verdicts.

The [pre-fix partial run](https://explorer-studio.genlayer.com/tx/0x501566b451df99ec3c25f4fd6dbdbb14ad77c2e76b5369f06a169a425adf2714)
reached majority agreement on a reversed C−B sign. Its state assertion caught
the error. The current contract takes the sign from the selected clause, and
the regression tests cover both directions.

The [StudioNet workflow](.github/workflows/proofs.yml) runs each report with
three disposable wallets. It checks finalized majority votes, decoded calldata,
actual holder changes and rollback on rejection. Generic CLI and receipt helpers
are reused under MIT from [ForkSplice](https://github.com/gabrieladash123-bit/fork-splice).

[Verified StudioNet receipts](proofs/README.md) · [Submission text](SUBMISSION.md)
