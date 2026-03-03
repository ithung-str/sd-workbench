# 18.12 Managing an Orchestrated Bank Run (DSB Bank)

## Model Metadata
- **Chapter**: 18 – Intermediate SD Cases
- **Type**: Intermediate Case
- **Domain**: Finance / Banking Crisis
- **Simulation Period**: 0–30 days
- **Time Step**: 0.125 day (3 hours)
- **Integration Method**: Euler

## Description
Detailed model of the 2009 DSB Bank run in the Netherlands, triggered by online coordination. Includes liquid/fixed assets, credibility dynamics, and bank failure conditions.

## Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| liquid_deposits | 4,500,000,000 | EUR |
| liquid_assets | 1,150,000,000 | EUR |
| fixed_assets | 4,600,000,000 | EUR |
| fixed_deposits | 1,000,000,000 | EUR |
| credibility_of_denials | 90% | dmnl |

## Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| liquid_liability_target | 20% | dmnl |
| liquidation_time | 1 | day |
| liquidation_premium | 10% | dmnl |
| hindrance_of_bank_failures | 0.5 | dmnl |
| withdrawal_time | 1 | day |

## Bank Failure Conditions
- Bank fails if liquid_ratio < 0.05
- Bank fails if total_asset_ratio < 0.9

## Lookup Tables
- Multiple lookup tables for perceived_likelihood functions linking public information to withdrawal behavior

## Sensitivity Analysis
- Vary credibility_of_denials initial: 50–100%
- Vary liquid_liability_target: 10–30%
- Test government guarantee announcement timing
- Test media response scenarios
