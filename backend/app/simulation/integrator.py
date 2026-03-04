from __future__ import annotations

import math
from bisect import bisect_right
from collections import deque

import numpy as np

from app.equations.evaluator import evaluate_expression, DimensionContext, ArrayLike
from app.schemas.model import FlowNode, LookupNode, StockNode
from app.simulation.translator import ExecutableModel



def _series_times(start: float, stop: float, dt: float) -> list[float]:
    n_steps = int(round((stop - start) / dt))
    times = [start + i * dt for i in range(n_steps + 1)]
    # avoid floating noise
    return [0.0 + t if abs(t) < 1e-12 else round(t, 12) for t in times]


def _lookup_interpolate(node: LookupNode, x_value: float) -> float:
    points = node.points
    if x_value <= points[0].x:
        return float(points[0].y)
    if x_value >= points[-1].x:
        return float(points[-1].y)
    xs = [p.x for p in points]
    idx = bisect_right(xs, x_value)
    left = points[idx - 1]
    right = points[idx]
    if right.x == left.x:
        return float(right.y)
    ratio = (x_value - left.x) / (right.x - left.x)
    return float(left.y + ratio * (right.y - left.y))


def _element_combos(dimensions: list[str], dim_ctx: DimensionContext) -> list[str]:
    """Generate element name combos for flattened series keys."""
    if not dimensions:
        return []
    if len(dimensions) == 1:
        return dim_ctx.dimensions[dimensions[0]]
    from itertools import product
    element_lists = [dim_ctx.dimensions[d] for d in dimensions]
    return [",".join(combo) for combo in product(*element_lists)]


def simulate_euler(executable: ExecutableModel, start: float, stop: float, dt: float) -> dict[str, list[float]]:
    times = _series_times(start, stop, dt)
    series: dict[str, list[float]] = {"time": times}

    dim_ctx = executable.dimension_context

    # initialize stocks
    stock_state: dict[str, ArrayLike] = {}
    for stock in executable.stock_nodes:
        initial = stock.initial_value
        if isinstance(initial, str):
            raw = evaluate_expression(initial, stock_state, dim_ctx)
        else:
            raw = float(initial)
        if stock.dimensions:
            shape = tuple(len(dim_ctx.dimensions[d]) for d in stock.dimensions)
            if isinstance(raw, np.ndarray):
                stock_state[stock.name] = raw
            else:
                stock_state[stock.name] = np.full(shape, float(raw))
        else:
            stock_state[stock.name] = float(raw) if not isinstance(raw, np.ndarray) else float(raw)

    # Initialize series keys for flattened array outputs
    for stock in executable.stock_nodes:
        if stock.dimensions:
            for combo in _element_combos(stock.dimensions, dim_ctx):
                series[f"{stock.name}[{combo}]"] = []
        else:
            series[stock.name] = []

    # initialize delay stocks at equilibrium (initial input value)
    # We need to evaluate transients once to get the initial input values
    delay_state: dict[str, float] = {}
    if executable.delay_stocks or executable.delay_fixed_specs:
        init_context: dict[str, ArrayLike] = dict(stock_state)
        init_context["TIME"] = start
        # Evaluate transients to get initial values for delay inputs
        for name in executable.transient_order:
            node = executable.node_by_name[name]
            if isinstance(node, LookupNode):
                x_input = float(evaluate_expression(node.equation, init_context, dim_ctx))
                init_context[name] = _lookup_interpolate(node, x_input)
            else:
                try:
                    init_context[name] = float(evaluate_expression(node.equation, init_context, dim_ctx))
                except KeyError:
                    init_context[name] = 0.0
        for ds in executable.delay_stocks:
            try:
                val = float(evaluate_expression(ds.input_expr, init_context, dim_ctx))
            except (KeyError, ValueError):
                val = 0.0
            delay_state[ds.name] = val
            init_context[ds.name] = val

    # Initialize delay_fixed circular buffers
    delay_fixed_buffers: dict[str, deque[float]] = {}
    delay_fixed_outputs: dict[str, float] = {}
    for dfspec in executable.delay_fixed_specs:
        delay_time = float(evaluate_expression(dfspec.delay_time_expr, init_context if (executable.delay_stocks or executable.delay_fixed_specs) else stock_state, dim_ctx))
        buf_len = max(1, int(round(delay_time / dt)))
        try:
            init_val = float(evaluate_expression(dfspec.initial_expr, init_context if (executable.delay_stocks or executable.delay_fixed_specs) else stock_state, dim_ctx))
        except (KeyError, ValueError):
            init_val = 0.0
        delay_fixed_buffers[dfspec.name] = deque([init_val] * buf_len, maxlen=buf_len)
        delay_fixed_outputs[dfspec.name] = init_val

    transient_names = [*executable.transient_order]
    for name in transient_names:
        node = executable.node_by_name[name]
        if hasattr(node, 'dimensions') and node.dimensions:
            for combo in _element_combos(node.dimensions, dim_ctx):
                series[f"{name}[{combo}]"] = []
        else:
            series[name] = []

    for _idx, _t in enumerate(times):
        context: dict[str, ArrayLike] = dict(stock_state)
        context["TIME"] = _t

        # inject delay stock values into context so rewritten equations can reference them
        context.update(delay_state)

        # Read delay_fixed outputs from buffer (oldest entry)
        for dfspec in executable.delay_fixed_specs:
            buf = delay_fixed_buffers[dfspec.name]
            delay_fixed_outputs[dfspec.name] = buf[0]

        # inject delay_fixed output values
        context.update(delay_fixed_outputs)

        # evaluate transients (aux + flow) in topological order
        for name in executable.transient_order:
            node = executable.node_by_name[name]
            if isinstance(node, LookupNode):
                x_input = evaluate_expression(node.equation, context, dim_ctx)
                if isinstance(x_input, np.ndarray):
                    context[name] = np.array([_lookup_interpolate(node, float(v)) for v in x_input])
                else:
                    context[name] = _lookup_interpolate(node, float(x_input))
            else:
                result = evaluate_expression(node.equation, context, dim_ctx)
                # Apply per-element overrides
                if hasattr(node, 'equation_overrides') and node.equation_overrides and hasattr(node, 'dimensions') and node.dimensions:
                    if not isinstance(result, np.ndarray):
                        shape = tuple(len(dim_ctx.dimensions[d]) for d in node.dimensions)
                        result = np.full(shape, float(result))
                    for elem, override_eq in node.equation_overrides.items():
                        idx = dim_ctx.element_index(node.name, elem)
                        result[idx] = float(evaluate_expression(override_eq, context, dim_ctx))
                # Broadcast scalar to array if node has dimensions
                if hasattr(node, 'dimensions') and node.dimensions and not isinstance(result, np.ndarray):
                    shape = tuple(len(dim_ctx.dimensions[d]) for d in node.dimensions)
                    result = np.full(shape, float(result))
                context[name] = result
            # Clamp flow values if min/max constraints are set
            if isinstance(node, FlowNode):
                val = context[name]
                if node.non_negative:
                    context[name] = np.maximum(val, 0.0) if isinstance(val, np.ndarray) else max(val, 0.0)
                if node.min_value is not None:
                    context[name] = np.maximum(context[name], node.min_value) if isinstance(context[name], np.ndarray) else max(context[name], node.min_value)
                if node.max_value is not None:
                    context[name] = np.minimum(context[name], node.max_value) if isinstance(context[name], np.ndarray) else min(context[name], node.max_value)
            # Record transient series
            if hasattr(node, 'dimensions') and node.dimensions:
                combos = _element_combos(node.dimensions, dim_ctx)
                flat = np.ravel(context[name])
                for i, combo in enumerate(combos):
                    key = f"{name}[{combo}]"
                    if key not in series:
                        series[key] = []
                    series[key].append(float(flat[i]))
            else:
                val = context[name]
                series[name].append(float(val) if not isinstance(val, np.ndarray) else float(val))

        # record stocks at current time
        for stock in executable.stock_nodes:
            if stock.dimensions:
                combos = _element_combos(stock.dimensions, dim_ctx)
                flat = np.ravel(stock_state[stock.name])
                for i, combo in enumerate(combos):
                    series[f"{stock.name}[{combo}]"].append(float(flat[i]))
            else:
                series[stock.name].append(float(stock_state[stock.name]))

        # derive stock derivatives and advance (skip on last time point)
        if _idx == len(times) - 1:
            continue

        next_stock_state: dict[str, ArrayLike] = {}
        for stock in executable.stock_nodes:
            derivative = evaluate_expression(stock.equation, context, dim_ctx)
            # Apply per-element overrides for stock equations
            if stock.equation_overrides and stock.dimensions:
                if not isinstance(derivative, np.ndarray):
                    shape = tuple(len(dim_ctx.dimensions[d]) for d in stock.dimensions)
                    derivative = np.full(shape, float(derivative))
                for elem, override_eq in stock.equation_overrides.items():
                    idx = dim_ctx.element_index(stock.name, elem)
                    derivative[idx] = float(evaluate_expression(override_eq, context, dim_ctx))
            current = stock_state[stock.name]
            if isinstance(current, np.ndarray):
                next_val = current + np.asarray(derivative) * dt
                if stock.non_negative:
                    next_val = np.maximum(next_val, 0.0)
                if stock.min_value is not None:
                    next_val = np.maximum(next_val, stock.min_value)
                if stock.max_value is not None:
                    next_val = np.minimum(next_val, stock.max_value)
                next_stock_state[stock.name] = next_val
            else:
                next_val = float(current) + float(derivative) * dt
                if stock.non_negative:
                    next_val = max(next_val, 0.0)
                if stock.min_value is not None:
                    next_val = max(next_val, stock.min_value)
                if stock.max_value is not None:
                    next_val = min(next_val, stock.max_value)
                next_stock_state[stock.name] = next_val
        stock_state = next_stock_state

        # advance delay stocks using Euler integration
        if executable.delay_stocks:
            next_delay_state = dict(delay_state)
            for ds in executable.delay_stocks:
                input_val = float(evaluate_expression(ds.input_expr, context, dim_ctx))
                delay_time = float(evaluate_expression(ds.delay_time_expr, context, dim_ctx))
                if delay_time <= 0:
                    next_delay_state[ds.name] = input_val
                else:
                    derivative = (input_val - delay_state[ds.name]) / delay_time
                    next_delay_state[ds.name] = delay_state[ds.name] + derivative * dt
            delay_state = next_delay_state

        # Advance delay_fixed buffers: push current input, pop oldest
        for dfspec in executable.delay_fixed_specs:
            input_val = float(evaluate_expression(dfspec.input_expr, context, dim_ctx))
            buf = delay_fixed_buffers[dfspec.name]
            buf.append(input_val)  # deque with maxlen auto-pops leftmost

    # include requested outputs only + time, but retain dependency vars if explicitly requested
    requested = set(executable.outputs)
    out_series = {"time": series["time"]}
    for key, values in series.items():
        if key == "time":
            continue
        base_name = key.split("[")[0] if "[" in key else key
        if key in requested or base_name in requested:
            out_series[key] = values
    return out_series
