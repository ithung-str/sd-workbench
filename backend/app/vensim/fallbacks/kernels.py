from __future__ import annotations

import math
import random
from typing import Callable


KernelFn = Callable[[list[float], float, random.Random], float]


def _clip(value: float, lower: float | None, upper: float | None) -> float:
    if lower is not None:
        value = max(lower, value)
    if upper is not None:
        value = min(upper, value)
    return value


def _step(args: list[float], t: float, _rng: random.Random) -> float:
    height = args[0] if len(args) > 0 else 0.0
    t0 = args[1] if len(args) > 1 else 0.0
    return height if t >= t0 else 0.0


def _ramp(args: list[float], t: float, _rng: random.Random) -> float:
    slope = args[0] if len(args) > 0 else 0.0
    t0 = args[1] if len(args) > 1 else 0.0
    t1 = args[2] if len(args) > 2 else None
    if t < t0:
        return 0.0
    if t1 is None or t <= t1:
        return slope * (t - t0)
    return slope * (t1 - t0)


def _pulse(args: list[float], t: float, _rng: random.Random) -> float:
    amp = args[0] if len(args) > 0 else 0.0
    t0 = args[1] if len(args) > 1 else 0.0
    width = args[2] if len(args) > 2 else 1e-9
    return amp if t0 <= t < t0 + max(width, 1e-9) else 0.0


def _pulse_train(args: list[float], t: float, _rng: random.Random) -> float:
    amp = args[0] if len(args) > 0 else 0.0
    first = args[1] if len(args) > 1 else 0.0
    interval = args[2] if len(args) > 2 else 0.0
    last = args[3] if len(args) > 3 else math.inf
    if interval <= 0 or t < first or t > last:
        return 0.0
    k = round((t - first) / interval)
    at = first + k * interval
    return amp if abs(at - t) <= 1e-9 else 0.0


def _identity_input(args: list[float], _t: float, _rng: random.Random) -> float:
    return args[0] if args else 0.0


def _get_time_value(args: list[float], t: float, _rng: random.Random) -> float:
    if len(args) > 1:
        return args[1]
    return t


def _random_normal(args: list[float], _t: float, rng: random.Random) -> float:
    mean = args[0] if len(args) > 0 else 0.0
    stddev = abs(args[1]) if len(args) > 1 else 1.0
    lower = args[2] if len(args) > 2 else None
    upper = args[3] if len(args) > 3 else None
    return _clip(rng.gauss(mean, stddev), lower, upper)


def _random_exponential(args: list[float], _t: float, rng: random.Random) -> float:
    mean = max(args[0], 1e-9) if len(args) > 0 else 1.0
    lower = args[1] if len(args) > 1 else None
    upper = args[2] if len(args) > 2 else None
    value = rng.expovariate(1.0 / mean)
    return _clip(value, lower, upper)


def _shift_if_true(args: list[float], _t: float, _rng: random.Random) -> float:
    cond = args[0] if len(args) > 0 else 0.0
    value = args[1] if len(args) > 1 else 0.0
    return value if cond != 0 else 0.0


_KERNELS: dict[str, KernelFn] = {
    "STEP": _step,
    "RAMP": _ramp,
    "PULSE": _pulse,
    "PULSE TRAIN": _pulse_train,
    "DELAY1": _identity_input,
    "DELAY3": _identity_input,
    "DELAYN": _identity_input,
    "SMOOTH": _identity_input,
    "SMOOTH3": _identity_input,
    "SMOOTHN": _identity_input,
    "GET TIME VALUE": _get_time_value,
    "RANDOM NORMAL": _random_normal,
    "RANDOM EXPONENTIAL": _random_exponential,
    "SHIFT IF TRUE": _shift_if_true,
}


def kernel_names() -> set[str]:
    return set(_KERNELS.keys())


def evaluate_kernel(name: str, args: list[float], t: float = 0.0, seed: int = 42) -> float:
    key = name.upper().strip()
    if key not in _KERNELS:
        raise KeyError(f"No fallback kernel for '{name}'")
    rng = random.Random(seed)
    return float(_KERNELS[key](args, t, rng))
