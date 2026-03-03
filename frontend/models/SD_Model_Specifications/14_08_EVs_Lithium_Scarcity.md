# 14.8 Electric Vehicles and Lithium Scarcity

## Model Metadata
- **Chapter**: 14 – Simple SD Cases
- **Type**: Simple Case
- **Domain**: Resource Economics / Technology
- **Simulation Period**: 2000–2100
- **Time Step**: 1 year
- **Integration Method**: Euler

## Description
Model of electric vehicle adoption constrained by lithium availability, with recycling and substitution dynamics.

## Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| lithium_reserves | 11,000,000 | tonnes |
| lithium_in_use | 0 | tonnes |
| EV_fleet | 0 | vehicles |
| conventional_fleet | 800,000,000 | vehicles |

## Flows
| Flow | Equation | Unit |
|------|----------|------|
| lithium_extraction | based on EV production demand | tonnes/yr |
| lithium_recycling | lithium_in_use * recycling_rate / battery_lifetime | tonnes/yr |
| EV_sales | adoption function of price, availability | vehicles/yr |
| EV_scrappage | EV_fleet / avg_EV_lifetime | vehicles/yr |

## Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| lithium_per_EV | 8 | kg |
| avg_EV_lifetime | 15 | years |
| battery_lifetime | 10 | years |
| initial_recycling_rate | 0.05 | dmnl |

## Sensitivity Analysis
- Vary lithium_per_EV: 4–15 (technology improvement)
- Vary recycling_rate: 0.05–0.95
- Vary total reserves: 5M–30M tonnes
