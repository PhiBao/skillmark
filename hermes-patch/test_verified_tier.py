"""Tests for the Skillmark `verified` trust-tier patch against a clean Hermes checkout.

Run: python -m pytest hermes-patch/test_verified_tier.py
Set HERMES_SOURCE to a Hermes checkout root if it is not at ~/.hermes/hermes-agent.
"""

import importlib.util
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

PATCH = Path(__file__).with_name("verified_tier.patch")
HERMES_ROOT = Path(
    os.environ.get("HERMES_SOURCE", Path.home() / ".hermes" / "hermes-agent")
)


@pytest.fixture(scope="module")
def guard(tmp_path_factory):
    """Apply the patch to a fresh copy of the Hermes tools package, then import it."""
    root = tmp_path_factory.mktemp("hermes")
    (root / "tools").mkdir()
    for name in (
        "skills_guard.py",
        "skills_guard_credentials.py",
        "threat_patterns.py",
    ):
        shutil.copy(HERMES_ROOT / "tools" / name, root / "tools" / name)
    result = subprocess.run(
        ["patch", "-p1", "-i", str(PATCH.resolve())], cwd=root, capture_output=True, text=True
    )
    assert result.returncode == 0, result.stdout + result.stderr
    sys.path.insert(0, str(root))
    try:
        spec = importlib.util.spec_from_file_location(
            "patched_skills_guard", root / "tools" / "skills_guard.py"
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        yield module
    finally:
        sys.path.remove(str(root))


def scan(guard, verdict, trust="verified", findings=None):
    return guard.ScanResult(
        skill_name="invoice-parser",
        source="well-known",
        trust_level=trust,
        verdict=verdict,
        findings=findings or [],
    )


def test_patch_applies_and_adds_the_policy(guard):
    assert guard.INSTALL_POLICY["verified"] == ("allow", "allow", "block")


def test_safe_and_caution_are_allowed(guard):
    for verdict in ("safe", "caution"):
        allowed, reason = guard.should_allow_install(scan(guard, verdict))
        assert allowed is True, reason


def test_dangerous_is_never_overridden(guard):
    finding = guard.Finding(
        pattern_id="env_exfil_curl",
        severity="critical",
        category="exfiltration",
        file="scripts/report.sh",
        line=4,
        match="curl ...$API_KEY",
        description="exfiltration pattern",
    )
    result = scan(guard, "dangerous", findings=[finding])
    allowed, reason = guard.should_allow_install(result, force=True)
    assert allowed is False
    assert "--force does not override a dangerous verdict" in reason


def test_pluggable_verifier_promotes_only_on_verified(guard, tmp_path):
    original = guard.SKILLMARK_VERIFIER
    try:
        guard.SKILLMARK_VERIFIER = lambda path: True
        result = guard.maybe_promote_to_verified(scan(guard, "safe", trust="community"), str(tmp_path))
        assert result.trust_level == "verified"

        guard.SKILLMARK_VERIFIER = lambda path: False
        result = guard.maybe_promote_to_verified(scan(guard, "safe", trust="community"), str(tmp_path))
        assert result.trust_level == "community"

        guard.SKILLMARK_VERIFIER = lambda path: True
        result = guard.maybe_promote_to_verified(scan(guard, "dangerous", trust="community"), str(tmp_path))
        assert result.trust_level == "verified"
        assert guard.should_allow_install(result, force=True)[0] is False
    finally:
        guard.SKILLMARK_VERIFIER = original


def test_json_verifier_parses_the_cli(guard, monkeypatch):
    calls = []

    class Proc:
        returncode = 0
        stdout = '{"result": "verified", "manifestHash": "sha256:ab"}'
        stderr = ""

    def fake_run(args, **kwargs):
        calls.append(args)
        return Proc()

    monkeypatch.setattr(guard._skillmark_subprocess, "run", fake_run)
    assert guard.skillmark_verify_json("/tmp/skill") is True
    assert calls[0][:2] == ["skillmark", "verify"]
