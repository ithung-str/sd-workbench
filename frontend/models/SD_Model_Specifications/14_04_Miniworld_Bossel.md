# 14.4 Miniworld (Bossel)

## Model Metadata
- **Chapter**: 14 – Simple SD Cases
- **Type**: Simple Case
- **Domain**: Sustainability / World Dynamics
- **Simulation Period**: 1900–2100
- **Time Step**: 0.25 year
- **Integration Method**: Euler

## Description
Simplified world model (after Bossel) with population, economy, resources, pollution and food production interactions.

## Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| population | 1,000,000 | people |
| natural_resources | 10,000 | units |
| pollution | 0 | units |
| capital | 1,000 | units |

## Key Relationships
- Population growth depends on food availability and pollution
- Economic production depends on capital and resources
- Pollution accumulates from production and decays naturally
- Resources are non-renewable (finite stock)

## Sensitivity Analysis
- Vary resource_discovery_rate
- Vary pollution_generation_per_unit_production
- Test technology improvement scenarios
