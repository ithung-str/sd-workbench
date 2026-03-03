# 14.6 New Town Planning

## Model Metadata
- **Chapter**: 14 – Simple SD Cases
- **Type**: Simple Case
- **Domain**: Urban Planning
- **Simulation Period**: 0–50 years
- **Time Step**: 1 year
- **Integration Method**: Euler

## Description
Planning model for a new town development: population growth, housing construction, infrastructure, and services co-development.

## Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| population | 0 | people |
| housing | 0 | houses |
| infrastructure | 0 | units |

## Key Dynamics
- Population attracted by housing availability and infrastructure quality
- Housing construction driven by expected population growth
- Infrastructure built to support population
- Delays between planning, construction, and delivery

## Sensitivity Analysis
- Vary construction delays
- Vary attractiveness factors
- Test phased vs rapid development
