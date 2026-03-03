# 14.1 Managing a Faculty

## Model Metadata
- **Chapter**: 14 – Simple SD Cases
- **Type**: Simple Case
- **Domain**: Education / HR Management
- **Simulation Period**: 2000–2040 (40 years)
- **Time Step**: 0.25 year
- **Integration Method**: Euler

## Description
Academic faculty workforce model with aging chain (assistant → associate → full professor), tenure, retirement, and hiring policies.

## Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| assistant_professors | 10 | people |
| associate_professors | 20 | people |
| full_professors | 30 | people |

## Flows
| Flow | Equation | Unit |
|------|----------|------|
| hiring | based on vacancies and budget | people/yr |
| promotion_to_associate | assistant_professors / avg_time_to_tenure | people/yr |
| promotion_to_full | associate_professors / avg_time_to_full | people/yr |
| retirement | full_professors / avg_time_to_retirement | people/yr |
| attrition_assistant | assistant_professors * attrition_rate_assistant | people/yr |
| attrition_associate | associate_professors * attrition_rate_associate | people/yr |

## Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| avg_time_to_tenure | 6 | years |
| avg_time_to_full | 8 | years |
| avg_time_to_retirement | 15 | years |
| attrition_rate_assistant | 0.05 | 1/yr |
| attrition_rate_associate | 0.02 | 1/yr |
| desired_total_faculty | 60 | people |

## Sensitivity Analysis
- Vary retirement age policies
- Vary hiring budget constraints
- Test tenure denial rates: 0–30%
