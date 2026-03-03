# 14.3 Debt Crisis

## Model Metadata
- **Chapter**: 14 – Simple SD Cases
- **Type**: Simple Case
- **Domain**: Economics / Finance
- **Simulation Period**: 0–50 years
- **Time Step**: 0.25 year
- **Integration Method**: Euler

## Description
Model of sovereign debt dynamics with feedback between debt, interest payments, GDP growth, and austerity measures.

## Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| debt | 60% of GDP | EUR |
| GDP | 100 | index |

## Flows
| Flow | Equation | Unit |
|------|----------|------|
| new_borrowing | government_deficit | EUR/yr |
| interest_payments | debt * interest_rate | EUR/yr |
| GDP_growth | GDP * growth_rate * (1 - debt_burden_effect) | EUR/yr |

## Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| interest_rate | 0.05 | 1/yr |
| base_growth_rate | 0.03 | 1/yr |
| primary_deficit_ratio | 0.03 | dmnl |

## Lookup Tables
- debt_burden_effect: debt_to_GDP_ratio → growth_reduction

## Sensitivity Analysis
- Vary interest_rate: 0.02–0.10
- Vary primary_deficit_ratio: 0–0.06
- Test austerity policies: reducing deficit when debt/GDP > threshold
