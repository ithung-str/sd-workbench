# 6.6 Arms Race (Richardson Model)

## Model Metadata
- **Chapter**: 6 – Introductory SD Exercises
- **Type**: Introductory
- **Domain**: Political Science / Conflict
- **Simulation Period**: 0–50 years
- **Time Step**: 1 year
- **Integration Method**: Euler

## Description
Richardson arms race model: two nations increase armaments in response to the other's stockpile, with fatigue and grievance factors.

## Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| arms_nation_A | 100 | units |
| arms_nation_B | 100 | units |

## Flows
| Flow | Equation | Unit |
|------|----------|------|
| increase_A | threat_coefficient_A * arms_nation_B - fatigue_coefficient_A * arms_nation_A + grievance_A | units/yr |
| increase_B | threat_coefficient_B * arms_nation_A - fatigue_coefficient_B * arms_nation_B + grievance_B | units/yr |

## Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| threat_coefficient_A | 0.2 | dmnl |
| threat_coefficient_B | 0.2 | dmnl |
| fatigue_coefficient_A | 0.1 | 1/yr |
| fatigue_coefficient_B | 0.1 | 1/yr |
| grievance_A | 10 | units/yr |
| grievance_B | 10 | units/yr |

## Sensitivity Analysis
- Vary threat_coefficients: 0.05–0.5 (explore stability conditions)
- Vary asymmetric grievances
