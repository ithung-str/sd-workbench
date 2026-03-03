# 14.14 Social Housing Redevelopment

## Model Metadata
- **Chapter**: 14 – Simple SD Cases
- **Type**: Simple Case
- **Domain**: Housing Policy / Urban Planning
- **Simulation Period**: 2000–2040
- **Time Step**: 0.25 year
- **Integration Method**: Euler

## Description
Model of social housing redevelopment program with demolition, renovation, and new construction cycles, and tenant displacement dynamics.

## Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| old_social_housing | 100,000 | dwellings |
| renovated_housing | 0 | dwellings |
| new_housing | 0 | dwellings |
| displaced_tenants | 0 | households |

## Flows
| Flow | Equation | Unit |
|------|----------|------|
| demolition | planned_demolition_rate | dwellings/yr |
| renovation | planned_renovation_rate | dwellings/yr |
| new_construction | based on land freed and budget | dwellings/yr |
| rehousing | displaced_tenants / avg_rehousing_time | households/yr |

## Sensitivity Analysis
- Vary demolition vs renovation balance
- Vary budget constraints
- Test social impact of different redevelopment speeds
