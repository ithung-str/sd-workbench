# 6.9 SD Education Diffusion (Bass Model)

## Model Metadata
- **Chapter**: 6 – Introductory SD Exercises
- **Type**: Introductory
- **Domain**: Technology Diffusion / Education
- **Simulation Period**: 0–30 years
- **Time Step**: 0.25 year
- **Integration Method**: Euler

## Description
Bass diffusion model applied to the adoption of SD education in universities. Innovation-driven and imitation-driven adoption.

## Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| potential_adopters | 1,000 | universities |
| adopters | 0 | universities |

## Flows
| Flow | Equation | Unit |
|------|----------|------|
| adoption | (innovation_coefficient + imitation_coefficient * adopters / total_market) * potential_adopters | universities/yr |

## Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| total_market | 1,000 | universities |
| innovation_coefficient (p) | 0.01 | 1/yr |
| imitation_coefficient (q) | 0.3 | 1/yr |

## Sensitivity Analysis
- Vary p: 0.005–0.05
- Vary q: 0.1–0.5
