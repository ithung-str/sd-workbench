# 6.10 Micro-CHP Diffusion

## Model Metadata
- **Chapter**: 6 – Introductory SD Exercises
- **Type**: Introductory
- **Domain**: Energy Technology / Diffusion
- **Simulation Period**: 0–40 years
- **Time Step**: 0.25 year
- **Integration Method**: Euler

## Description
Diffusion model for micro combined heat and power (CHP) technology in households, with learning curve cost reduction effects.

## Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| potential_adopters | 7,000,000 | households |
| adopters | 0 | households |

## Flows
| Flow | Equation | Unit |
|------|----------|------|
| adoption | potential_adopters * (p + q * adopters / total_market) * price_effect | households/yr |

## Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| total_market | 7,000,000 | households |
| p (innovation) | 0.005 | 1/yr |
| q (imitation) | 0.3 | 1/yr |
| initial_price | 10,000 | EUR |
| learning_rate | 0.15 | dmnl |

## Lookup Tables
- price_effect: relative_price → adoption_multiplier

## Sensitivity Analysis
- Vary learning_rate: 0.10–0.25
- Vary q: 0.1–0.5
