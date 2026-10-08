# GeoTech ML Data Folder Contract

Use this folder shape for mock data now and for client uploads later:

```text
ml_data/
  raw/
    projects.csv
    daily_reports.csv
    expenditures.csv
    vendors.csv
    machinery.csv
    supervisors.csv
  processed/
    project_training_table.csv
  models/
    delay_classifier.pkl
    delay_days_forecaster.pkl
    cost_overrun_classifier.pkl
    projected_cost_forecaster.pkl
    overrun_percent_forecaster.pkl
  reports/
    training_metrics.json
  templates/
    projects.csv
    daily_reports.csv
    expenditures.csv
    vendors.csv
    machinery.csv
    supervisors.csv
```

## Training Targets

`raw/`, `processed/`, `models/`, and `reports/` are generated locally and are not committed. The repository keeps only scripts, templates, and documentation.

Delay model labels:

- `was_delayed`: `1` when `actual_end_date > planned_end_date`, else `0`.
- `delay_days`: number of days after planned end date.

Cost model labels:

- `was_over_budget`: `1` when `actual_total_cost > project_budget`, else `0`.
- `overrun_percent`: `(actual_total_cost - project_budget) / project_budget`.

## Minimum Useful Data

- Start with rule-based scoring until there are at least 50 completed projects.
- Train first baseline models around 50-100 completed projects.
- Expect better results around 200+ completed projects and 500+ daily reports.

## Recommended Model Start

For tabular data:

- Delay classification: `RandomForestClassifier` or `XGBoost/LightGBM` if available.
- Delay days regression: `RandomForestRegressor`.
- Cost overrun classification: `RandomForestClassifier`.
- Projected cost regression: `RandomForestRegressor`.

Keep the backend analytics API stable. Later, replace the internal scoring logic with model inference that returns the same JSON shape.
