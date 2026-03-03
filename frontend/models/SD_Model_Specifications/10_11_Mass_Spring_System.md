# 10.11 Mass-Spring System

## Model Metadata
- **Chapter**: 10 – Technical SD Exercises
- **Type**: Technical / Physics
- **Domain**: Mechanical Physics
- **Simulation Period**: 0–20 seconds
- **Time Step**: 0.01 second
- **Integration Method**: RK4 (recommended)

## Description
Oscillating mass on a spring with damping. Demonstrates second-order systems and the importance of integration method choice.

## Stocks
| Stock | Initial Value | Unit |
|-------|--------------|------|
| position | 1 | m |
| velocity | 0 | m/s |

## Flows
| Flow | Equation | Unit |
|------|----------|------|
| velocity_change | (-spring_constant * position - damping * velocity) / mass | m/s² |
| position_change | velocity | m/s |

## Parameters
| Parameter | Value | Unit |
|-----------|-------|------|
| mass | 1 | kg |
| spring_constant | 1 | N/m |
| damping | 0.1 | N·s/m |

## Sensitivity Analysis
- Compare Euler vs RK4 integration at various time steps
- Vary damping: 0–2 (underdamped, critically damped, overdamped)
- Vary time step: 0.001–1.0 to observe numerical instability with Euler
