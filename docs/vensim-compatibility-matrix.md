# Vensim Compatibility Matrix (Scaffold)

Track Vensim feature/function support across:
- PySD translation/execution support
- backend import support
- backend execution support
- frontend inspection/edit support
- parity test coverage

## Columns
- Feature / Function
- Category
- PySD Support (yes / partial / no)
- App Import Tier
- App Execution Tier
- App Editor Tier
- Notes / Deviations
- Test Coverage

## Initial Seed Entries
| Feature | Category | PySD | Import | Execute | Editor | Notes | Tests |
|---|---|---|---|---|---|---|---|
| INITIAL TIME / FINAL TIME / TIME STEP / SAVEPER | Time | partial | T1 | T1 | T0 | Extracted heuristically + introspection | TODO |
| STEP | Exogenous inputs | partial | T1 | T1 | T0 | Capability detection only initially | TODO |
| RAMP | Exogenous inputs | partial | T1 | T1 | T0 | Capability detection only initially | TODO |
| DELAY1/3/N | Dynamic functions | partial | T1 | T1 | T0 | Delegated to PySD runtime | TODO |
| SMOOTH/3/N | Dynamic functions | partial | T1 | T1 | T0 | Delegated to PySD runtime | TODO |
| LOOKUPS | Table functions | unknown | T1 | T1 | T0 | Metadata extraction pending | TODO |
| Subscripts / arrays | Dimensions | unknown | T1 | T1 | T0 | UI slice support pending | TODO |
| Macros | Structure | unknown | T1 | T1 | T0 | Module tree support pending | TODO |
