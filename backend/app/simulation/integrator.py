from __future__ import annotations

import math
from bisect import bisect_right
from collections import deque

from app.equations.evaluator import evaluate_expression
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



def simulate_euler(executable: ExecutableModel, start: float, stop: float, dt: float) -> dict[str, list[float]]:
    times = _series_times(start, stop, dt)
    series: dict[str, list[float]] = {"time": times}

    # initialize stocks
    stock_state: dict[str, float] = {}
    for stock in executable.stock_nodes:
        initial = stock.initial_value
        if isinstance(initial, str):
            stock_state[stock.name] = float(evaluate_expression(initial, stock_state))
        else:
            stock_state[stock.name] = float(initial)
        series[stock.name] = []

    # initialize delay stocks at equilibrium (initial input value)
    # We need to evaluate transients once to get the initial input values
    delay_state: dict[str, float] = {}
    if executable.delay_stocks or executable.delay_fixed_specs:
        init_context: dict[str, float] = dict(stock_state)
        init_context["TIME"] = start
        # Evaluate transients to get initial values for delay inputs
        for name in executable.transient_order:
            node = executable.node_by_name[name]
            if isinstance(node, LookupNode):
                x_input = float(evaluate_expression(node.equation, init_context))
                init_context[name] = _lookup_interpolate(node, x_input)
            else:
                try:
                    init_context[name] = float(evaluate_expression(node.equation, init_context))
                except KeyError:
                    init_context[name] = 0.0
        for ds in executable.delay_stocks:
            try:
                val = float(evaluate_expression(ds.input_expr, init_context))
            except (KeyError, ValueError):
                val = 0.0
            delay_state[ds.name] = val
            init_context[ds.name] = val

    # Initialize delay_fixed circular buffers
    delay_fixed_buffers: dict[str, deque[float]] = {}
    delay_fixed_outputs: dict[str, float] = {}
    for dfspec in executable.delay_fixed_specs:
        delay_time = float(evaluate_expression(dfspec.delay_time_expr, init_context if (executable.delay_stocks or executable.delay_fixed_specs) else stock_state))
        buf_len = max(1, int(round(delay_time / dt)))
        try:
            init_val = float(evaluate_expression(dfspec.initial_expr, init_context if (executable.delay_stocks or executable.delay_fixed_specs) else stock_state))
        except (KeyError, ValueError):
            init_val = 0.0
        delay_fixed_buffers[dfspec.name] = deque([init_val] * buf_len, maxlen=buf_len)
        delay_fixed_outputs[dfspec.name] = init_val

    transient_names = [*executable.transient_order]
    for name in transient_names:
        series[name] = []

    for _idx, _t in enumerate(times):
        context: dict[str, float] = dict(stock_state)
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
                x_input = float(evaluate_expression(node.equation, context))
                context[name] = _lookup_interpolate(node, x_input)
            else:
                context[name] = float(evaluate_expression(node.equation, context))
            # Clamp flow values if min/max constraints are set
            if isinstance(node, FlowNode):
                if node.non_negative:
                    context[name] = max(context[name], 0.0)
                if node.min_value is not None:
                    context[name] = max(context[name], node.min_value)
                if node.max_value is not None:
                    context[name] = min(context[name], node.max_value)
            series[name].append(context[name])

        # record stocks at current time
        for stock in executable.stock_nodes:
            series[stock.name].append(stock_state[stock.name])

        # derive stock derivatives and advance (skip on last time point)
        if _idx == len(times) - 1:
            continue

        next_stock_state = dict(stock_state)
        for stock in executable.stock_nodes:
            derivative = float(evaluate_expression(stock.equation, context))
            next_stock_state[stock.name] = stock_state[stock.name] + derivative * dt
            # Clamp stock values if min/max constraints are set
            if stock.non_negative:
                next_stock_state[stock.name] = max(next_stock_state[stock.name], 0.0)
            if stock.min_value is not None:
                next_stock_state[stock.name] = max(next_stock_state[stock.name], stock.min_value)
            if stock.max_value is not None:
                next_stock_state[stock.name] = min(next_stock_state[stock.name], stock.max_value)
        stock_state = next_stock_state

        # advance delay stocks using Euler integration
        if executable.delay_stocks:
            next_delay_state = dict(delay_state)
            for ds in executable.delay_stocks:
                input_val = float(evaluate_expression(ds.input_expr, context))
                delay_time = float(evaluate_expression(ds.delay_time_expr, context))
                if delay_time <= 0:
                    next_delay_state[ds.name] = input_val
                else:
                    derivative = (input_val - delay_state[ds.name]) / delay_time
                    next_delay_state[ds.name] = delay_state[ds.name] + derivative * dt
            delay_state = next_delay_state

        # Advance delay_fixed buffers: push current input, pop oldest
        for dfspec in executable.delay_fixed_specs:
            input_val = float(evaluate_expression(dfspec.input_expr, context))
            buf = delay_fixed_buffers[dfspec.name]
            buf.append(input_val)  # deque with maxlen auto-pops leftmost

    # include requested outputs only + time, but retain dependency vars if explicitly requested
    requested = set(executable.outputs)
    out_series = {"time": series["time"]}
    for key, values in series.items():
        if key == "time":
            continue
        if key in requested:
            out_series[key] = values
    return out_series
