# 10.12 Gas in a Vessel (Ideal Gas Law)

## Model Metadata
- **Chapter**: 10 – Technical SD Exercises
- **Type**: Technical / Physics
- **Domain**: Thermodynamics
- **Simulation Period**: 0–10 minutes
- **Time Step**: 0.1 minute
- **Integration Method**: Euler

## Description
Model of gas behavior in a vessel with pressure, volume and temperature relationships following the ideal gas law.

## Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| gas_amount | varies | mol |
| temperature | 293 | K |

## Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| R (gas constant) | 8.314 | J/(mol·K) |
| volume | 0.01 | m³ |

## Key Equations
- pressure = gas_amount * R * temperature / volume
- Model gas flows in/out and temperature changes

## Sensitivity Analysis
- Vary initial temperature and gas amount
- Compare Euler vs RK4
