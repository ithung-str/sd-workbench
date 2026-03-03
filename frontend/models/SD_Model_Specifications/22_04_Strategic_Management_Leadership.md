# 22.4 Strategic Management and Leadership

## Model Metadata
- **Chapter**: 22 – Advanced SD Cases
- **Type**: Advanced Case (Flight Simulator)
- **Domain**: Strategic Management / HR
- **Simulation Period**: 2010–2035
- **Time Step**: 1 year
- **Integration Method**: Euler

## Description
SD-based leadership flight simulator with four types of human capital (lowly skilled, highly skilled, social networkers, authentic leaders), organizational structure decisions, and environmental alignment scoring.

## Stocks (4 Employee Categories)
| Stock | Description | Unit |
|-------|------------|------|
| lowly_skilled_personnel | Basic workforce | people |
| highly_skilled_personnel | Knowledge workers | people |
| social_networkers | Networked employees | people |
| authentic_leaders | Intrinsic leaders | people |

## Additional Stocks
- financial_buffer (revenues - costs - taxes)
- investments_in_stability
- investments_in_flexibility

## Key Concepts
- **Transformational culture** = fraction(authentic_leaders + social_networkers)
- **Transactional culture** = fraction(lowly_skilled + highly_skilled)
- **Transformational structure score** = MIN(transformational_culture, transformational_structure, authenticity_flexibility_orientedness)
- **Transactional organization score** = MIN(transactional_culture, transactional_structure, 1 - authenticity_flexibility_orientedness)

## Decision Variables (9 sliders)
1. Total planned personnel expenditures
2. Fraction spent on lowly skilled
3. Fraction spent on highly skilled
4. Fraction spent on social networkers
5. Fraction spent on authentic leaders
6. Total planned networking expenditures
7. Authenticity/flexibility orientedness (0=stability, 1=flexibility)
8. Investments in organizational stability
9. Investments in organizational flexibility

## Exogenous Drivers
- ideal_degree_of_flexibility_and_authenticity (time series)
- workforce_flexibility (time series)
- Three scenarios (S1, S2, S3) with different driver trajectories

## Leadership Strategies to Test
- Transactional, Transformational, Ambidextrous, Robust, Contingent, Transitional, Inconsistent

## Sensitivity Analysis
- Compare all leadership strategy outcomes
- Vary environmental scenarios (S1, S2, S3)
- Test consistency vs adaptability tradeoffs
