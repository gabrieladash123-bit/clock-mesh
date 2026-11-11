import ast
from hashlib import sha256
from itertools import product
import json
from pathlib import Path
import re

import pytest

ROOT = Path(__file__).resolve().parents[2]
CONTRACT = 'contracts/clock_mesh.py'
CASES = {
    'transitive': ([[2, 3], [2, 3], None], 'CONSISTENT', [0, 1, 2]),
    'partial': ([[1, 3], [2, 3], None], 'CONSISTENT', [1, 2]),
    'inconsistent': ([[2, 3], [2, 3], [0, 1]], 'INCONSISTENT', []),
    'unresolved': ('UNRESOLVED', 'UNRESOLVED', []),
}
SELECTIONS = {
    'transitive': {'ab': 'S2', 'bc': 'S3', 'ac': 'ABSENT'},
    'partial': {'ab': 'S2', 'bc': 'S3', 'ac': 'ABSENT'},
    'inconsistent': {'ab': 'S3', 'bc': 'S4', 'ac': 'S5'},
    'unresolved': {'ab': 'S2', 'bc': 'UNRESOLVED', 'ac': 'ABSENT'},
}


def oracle_test_functions():
    tree = ast.parse((ROOT / CONTRACT).read_text())
    body = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in ('closure', 'analyze')]
    namespace = {'PAIRS': [(0, 1), (1, 2), (0, 2)]}
    exec(compile(ast.Module(body=body, type_ignores=[]), CONTRACT, 'exec'), namespace)
    return namespace


def test_tight_bounds_against_exhaustive_integer_timelines():
    analyze = oracle_test_functions()['analyze']
    intervals = [[a, b] for a in range(-3, 4) for b in range(a, 4)]
    differences = [(b, c - b, c) for b, c in product(range(-6, 7), repeat=2)]
    for rows in product(intervals, repeat=3):
        feasible = [x for x in differences if all(lo <= v <= hi for (lo, hi), v in zip(rows, x))]
        result = analyze(rows)
        if not feasible:
            assert result['conflict'] == [0, 1, 2]
        else:
            expected = [[min(col), max(col)] for col in zip(*feasible)]
            assert result['bounds'] == expected
            assert result['eligible'] == [i for i, (lo, hi) in enumerate(expected) if lo >= 2 and hi <= 6]


def test_disconnected_never_invents_a_bound():
    result = oracle_test_functions()['analyze']([None, [2, 6], None])
    assert result['bounds'] == [[None, None], [2, 6], [None, None]]
    assert result['eligible'] == [1]


def setup_case(vm, deploy, accounts, case):
    raw = (ROOT / 'reports' / (case + '.txt')).read_bytes()
    url = 'https://raw.githubusercontent.com/gabrieladash123-bit/clock-mesh/' + 'a' * 40 + '/reports/' + case + '.txt'
    sender, recipient = ['0x' + bytes(x).hex() for x in accounts[:2]]
    vm.sender = accounts[0]
    contract = deploy(CONTRACT, url, sha256(raw).hexdigest(), recipient)
    assert contract.get_state()['holders'] == [sender] * 3
    set_mocks(vm, url, raw, SELECTIONS[case])
    return contract, url, raw, sender, recipient


def set_mocks(vm, url, raw, selections, audit=None):
    vm.clear_mocks()
    vm.mock_web(re.escape(url), {'status': 200, 'body': raw})
    vm.mock_llm('CLOCKMESH-EXTRACT', json.dumps(selections))
    vm.mock_llm('CLOCKMESH-AUDIT', json.dumps(audit if audit is not None else {'ab': True, 'bc': True, 'ac': True}))


@pytest.mark.parametrize('case', CASES)
def test_full_resolution_and_holder_transfers(direct_vm, direct_deploy, direct_accounts, case):
    vm = direct_vm
    c, _, raw, issuer, recipient = setup_case(vm, direct_deploy, direct_accounts, case)
    rows, status, eligible = CASES[case]
    vm.sender = direct_accounts[1]
    with vm.expect_revert('Window not proven'):
        c.claim(0)
    vm.sender = direct_accounts[2]
    c.resolve()
    assert vm.run_validator() is True
    assert c.get_state()['observation'] == {'report': raw.decode(), 'rows': rows,
                                            'selections': SELECTIONS[case]}
    assert c.get_state()['analysis']['status'] == status
    assert c.get_state()['analysis']['eligible'] == eligible
    with vm.expect_revert('Recipient only'):
        c.claim(0)
    vm.sender = direct_accounts[1]
    for slot in range(3):
        before = c.get_state()
        if slot in eligible:
            c.claim(slot)
            with vm.expect_revert('Right already transferred'):
                c.claim(slot)
        else:
            with vm.expect_revert('Window not proven'):
                c.claim(slot)
            assert c.get_state() == before
    assert c.get_state()['holders'] == [recipient if i in eligible else issuer for i in range(3)]
    with vm.expect_revert('Report already resolved'):
        c.resolve()


@pytest.mark.parametrize('dimension', ['ab', 'bc', 'ac'])
@pytest.mark.parametrize('value', [False, 1, 'true'])
def test_validator_requires_each_actual_boolean(direct_vm, direct_deploy, direct_accounts, dimension, value):
    c, url, raw, _, _ = setup_case(direct_vm, direct_deploy, direct_accounts, 'transitive')
    c.resolve()
    audit = {'ab': True, 'bc': True, 'ac': True}
    audit[dimension] = value
    set_mocks(direct_vm, url, raw, SELECTIONS['transitive'], audit)
    assert direct_vm.run_validator() is False


@pytest.mark.parametrize('selection', ['ABSENT', 'UNRESOLVED', 'S3'])
def test_validator_rejects_consequential_differences(direct_vm, direct_deploy, direct_accounts, selection):
    c, url, raw, _, _ = setup_case(direct_vm, direct_deploy, direct_accounts, 'transitive')
    c.resolve()
    set_mocks(direct_vm, url, raw, dict(SELECTIONS['transitive'], ab=selection))
    assert direct_vm.run_validator() is False


def test_validator_refetches_and_checks_commitment(direct_vm, direct_deploy, direct_accounts):
    c, url, raw, _, _ = setup_case(direct_vm, direct_deploy, direct_accounts, 'transitive')
    c.resolve()
    set_mocks(direct_vm, url, raw + b'changed', SELECTIONS['transitive'])
    assert direct_vm.run_validator() is False


def test_schema_repair_does_not_accept_invented_permissions(direct_vm, direct_deploy, direct_accounts):
    c, url, raw, _, _ = setup_case(direct_vm, direct_deploy, direct_accounts, 'transitive')
    before = c.get_state()
    set_mocks(direct_vm, url, raw, dict(SELECTIONS['transitive'], ab='-3,-2'))
    with direct_vm.expect_revert('[LLM] Invalid timing decision'):
        c.resolve()
    assert c.get_state() == before


@pytest.mark.parametrize(('position', 'expected'), [('before', [2, 3]), ('after', [-3, -2])])
def test_direction_is_derived_from_source(direct_vm, direct_deploy, direct_accounts, position, expected):
    raw = f'Final approved reading: B occurs two to three seconds {position} C. All endpoints are inclusive.'.encode()
    url = 'https://raw.githubusercontent.com/gabrieladash123-bit/clock-mesh/' + 'a' * 40 + '/reports/order.txt'
    direct_vm.sender = direct_accounts[0]
    c = direct_deploy(CONTRACT, url, sha256(raw).hexdigest(), '0x' + bytes(direct_accounts[1]).hex())
    set_mocks(direct_vm, url, raw, {'ab': 'ABSENT', 'bc': 'S1', 'ac': 'ABSENT'})
    c.resolve()
    assert direct_vm.run_validator() is True
    assert c.get_state()['observation']['rows'] == [None, expected, None]
