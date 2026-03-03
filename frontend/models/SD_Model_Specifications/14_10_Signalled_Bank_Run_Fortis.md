# 14.10 Signalled Bank Run (Fortis)

## Model Metadata
- **Chapter**: 14 – Simple SD Cases
- **Type**: Simple Case
- **Domain**: Finance / Banking
- **Simulation Period**: 0–30 days
- **Time Step**: 0.25 day
- **Integration Method**: Euler

## Description
Model of a bank run at Fortis bank triggered by negative media signals and depositor panic.

## Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| liquid_deposits | 100,000 | M EUR |
| liquid_assets | 25,000 | M EUR |
| confidence | 1.0 | dmnl (0-1) |

## Flows
| Flow | Equation | Unit |
|------|----------|------|
| withdrawals | liquid_deposits * withdrawal_fraction * (1 - confidence) | M EUR/day |
| asset_liquidation | as needed to cover withdrawals | M EUR/day |

## Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| initial_liquid_ratio | 0.25 | dmnl |
| media_signal_intensity | varies | dmnl |
| confidence_recovery_time | 30 | days |

## Lookup Tables
- withdrawal_fraction: confidence_level → fraction_withdrawing
- media_impact: signal_strength → confidence_reduction

## Sensitivity Analysis
- Vary media_signal_intensity and timing
- Vary liquid_ratio: 0.10–0.40
- Test government guarantee announcement timing
