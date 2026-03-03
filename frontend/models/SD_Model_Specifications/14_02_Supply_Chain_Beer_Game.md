# 14.2 Supply Chain Management (Beer Game)

## Model Metadata
- **Chapter**: 14 – Simple SD Cases
- **Type**: Simple Case
- **Domain**: Operations / Supply Chain
- **Simulation Period**: 0–52 weeks
- **Time Step**: 1 week
- **Integration Method**: Euler

## Description
Classic Beer Distribution Game: 4-tier supply chain (factory → distributor → wholesaler → retailer) with demand amplification (bullwhip effect).

## Stocks (per tier)
| Stock | Initial Value | Unit |
|-------|--------------|------|
| inventory | 12 | cases |
| supply_line (on order) | 8 | cases |
| backlog | 0 | cases |

## Flows (per tier)
| Flow | Equation | Unit |
|------|----------|------|
| orders_placed | desired_stock - inventory + backlog + supply_line_adjustment | cases/wk |
| shipments_received | DELAY3(orders_placed_upstream, delivery_delay) | cases/wk |
| shipments_sent | MIN(inventory + shipments_received, backlog + incoming_orders) | cases/wk |

## Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| delivery_delay | 2 | weeks |
| stock_adjustment_time | 4 | weeks |
| desired_stock | 12 | cases |
| initial_demand | 4 | cases/wk |
| demand_step (at week 5) | 8 | cases/wk |

## Sensitivity Analysis
- Vary stock_adjustment_time: 1–8 weeks
- Vary delivery_delay: 1–6 weeks
- Compare centralized vs decentralized ordering
