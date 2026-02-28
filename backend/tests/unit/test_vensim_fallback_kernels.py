from __future__ import annotations

from app.vensim.fallbacks import evaluate_kernel, kernel_names


def test_kernel_registry_contains_advanced_set():
    names = kernel_names()
    assert "STEP" in names
    assert "RANDOM NORMAL" in names
    assert "SHIFT IF TRUE" in names


def test_step_and_ramp_kernels():
    assert evaluate_kernel("STEP", [2, 3], t=2) == 0
    assert evaluate_kernel("STEP", [2, 3], t=3) == 2
    assert evaluate_kernel("RAMP", [4, 1], t=3) == 8


def test_random_normal_is_seeded_and_clipped():
    a = evaluate_kernel("RANDOM NORMAL", [0, 1, -1, 1], seed=7)
    b = evaluate_kernel("RANDOM NORMAL", [0, 1, -1, 1], seed=7)
    assert a == b
    assert -1 <= a <= 1
