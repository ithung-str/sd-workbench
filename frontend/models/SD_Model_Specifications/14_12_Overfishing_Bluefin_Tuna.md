# 14.12 Overfishing Bluefin Tuna

## Model Metadata
- **Chapter**: 14 – Simple SD Cases
- **Type**: Simple Case
- **Domain**: Ecology / Fisheries Management
- **Simulation Period**: 1950–2050
- **Time Step**: 0.25 year
- **Integration Method**: Euler

## Description
Population dynamics model of Atlantic Bluefin Tuna under fishing pressure with stock-recruitment relationship and quota management.

## Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| tuna_population | 1,000,000 | tonnes |

## Flows
| Flow | Equation | Unit |
|------|----------|------|
| recruitment | population * growth_rate * (1 - population / carrying_capacity) | tonnes/yr |
| catch | MIN(fishing_effort * catchability * population, quota) | tonnes/yr |

## Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| carrying_capacity | 2,000,000 | tonnes |
| growth_rate | 0.1 | 1/yr |
| fishing_effort | varies | boats |
| catchability | 0.0001 | 1/(boat·yr) |
| quota | 30,000 | tonnes/yr |

## Sensitivity Analysis
- Vary quota: 10,000–60,000 tonnes/yr
- Vary growth_rate: 0.05–0.20
- Test IUU (illegal) fishing scenarios: 20–100% of quota
- Test fishing moratorium policies
