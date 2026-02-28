# Scenario & Sensitivity Guide

## Scenario Studio
- Use the left rail `Scenario Studio` panel to create policy scenarios.
- Baseline is created automatically when absent.
- Scenario overrides support:
  - simulation timing (`start`, `stop`, `dt`, `return_step`)
  - parameter values (`params` map)
  - optional output list

## Scenario Comparison
- Click `Run Scenarios` in the bottom dock toolbar.
- Open `Compare` tab to see overlaid scenario trajectories.
- Compare table supports variable selection and side-by-side values.

## Sensitivity
- Open `Sensitivity` tab.
- Choose output and metric (`final`, `max`, `min`, `mean`).
- Configure a parameter range and run:
  - `Run OAT` for one-at-a-time sweeps and tornado ranking.
  - `Run Monte Carlo` for seeded uncertainty runs and percentile summaries.

## Persistence
- Scenario definitions are stored in `model.metadata.analysis`.
- Export/import keeps scenario and baseline configuration with the model JSON.
