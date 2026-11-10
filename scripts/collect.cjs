// Assemble evidence only from completed hosted proofs.
const fs = require('node:fs');
const path = require('node:path');
const {root, assert, sourceHash, digest, equal, receiptSummary, save} = require('./transport.cjs');
const cases = ['transitive', 'partial', 'inconsistent', 'unresolved'];
const runs = process.argv.slice(2);
assert(runs.length === 4 && runs.every(x => /^[0-9]+$/.test(x)) && new Set(runs).size === 4, 'Pass the four completed run IDs in case order');
const explorer = 'https://explorer-studio.genlayer.com/';
const repo = 'https://github.com/gabrieladash123-bit/clock-mesh';
const code = fs.readFileSync(path.join(root, 'contracts/clock_mesh.py'));
const revision = fs.readFileSync(path.join(root, 'fixture-revision.txt'), 'utf8').trim();
const index = [];
const rows = [];
let successes = 0, rejections = 0, dissent = 0;
for (const [i, id] of cases.entries()) {
  const run = runs[i];
  const folder = path.join(root, '.proof-journal', 'run-' + run);
  const read = name => JSON.parse(fs.readFileSync(path.join(folder, name + '.json')));
  const report = read(id + '-verified');
  const expectedCalls = i < 2 ? 8 : 7;
  assert(report.id === id && report.source_sha256 === sourceHash && report.revision === revision && report.trace.length === expectedCalls, 'Complete source-bound proof required: ' + id);
  const raw = fs.readFileSync(path.join(root, 'reports', id + '.txt'));
  const final = report.trace.at(-1).state;
  assert(final.observation.report === raw.toString('utf8') && final.config.sha256 === digest(raw), 'Exact pinned source');
  let before;
  for (const step of report.trace) {
    const label = id + '-' + step.label + '-receipt';
    const receipt = read(label);
    const s = receiptSummary(receipt);
    assert(s.hash === step.hash && s.status === 'FINALIZED' && s.result === 'MAJORITY_AGREE' && s.agree > (s.agree+s.disagree+s.idle)/2, 'Verified majority receipt');
    assert((receipt.from_address || receipt.sender).toLowerCase() === step.signer && (receipt.to_address || receipt.recipient).toLowerCase() === report.contract.toLowerCase(), 'Matching signer and target');
    if (step.label === 'deploy') assert(code.equals(Buffer.from(receipt.data.contract_code, 'base64')), 'Exact deployed source');
    if (step.error) {
      const message = Buffer.from(receipt.consensus_data.leader_receipt[0].result, 'base64');
      assert(s.execution === 'ERROR' && message[0] === 1 && message.subarray(1).toString() === step.error && equal(before, step.state), 'Verified rejection and rollback');
      rejections++;
    } else {
      assert(['SUCCESS', 'FINISHED_WITH_RETURN'].includes(s.execution), 'Verified execution');
      successes++;
    }
    dissent += s.disagree;
    save(label, receipt);
    before = step.state;
  }
  const workflow = repo + '/actions/runs/' + run;
  const resolve = report.trace.find(x => x.label === 'resolve').hash;
  index.push({id, workflow, contract:report.contract, deployment:report.deployment, resolve, receipts:expectedCalls, eligible:final.analysis.eligible});
  rows.push(`| ${id} | [Contract](${explorer}address/${report.contract}) | [Deploy](${explorer}tx/${report.deployment}) | [Resolve](${explorer}tx/${resolve}) | ${final.analysis.eligible.join(', ') || 'none'} | [Run](${workflow}) |`);
  save(id + '-verified', report);
}
save('index', {source_sha256:sourceHash, fixture_revision:revision, successes, rejections, dissent, instances:index});
fs.writeFileSync(path.join(root, 'proofs/README.md'), [
  '# ClockMesh StudioNet proofs', '',
  `The hosted workflow verified **${successes+rejections} finalized receipts**: ${successes} successful calls and ${rejections} expected rejections. Validator vote maps include ${dissent} dissenting votes.`, '',
  '| Scenario | Address | Deployment | Consensus resolution | Eligible slots | Workflow |',
  '|---|---|---|---|---|---|', ...rows, '',
  'Each verified trace includes decoded calls and full state after every transaction. Raw receipts preserve execution results and vote maps.',
  `Source SHA-256: \`${sourceHash}\`.`,
  `Report revision: \`${revision}\`.`, ''
].join('\n'));
console.log(JSON.stringify({successes,rejections,dissent,instances:index},null,2));
