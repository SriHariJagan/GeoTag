# Training Plan

## 1. Normalize Client Files

If the client gives an unclear folder, convert it into these six canonical CSVs:

- `projects.csv`
- `daily_reports.csv`
- `expenditures.csv`
- `vendors.csv`
- `machinery.csv`
- `supervisors.csv`

If they provide Excel files, export each sheet to one of these CSVs. If column names differ, create a mapping file instead of changing model code every time.

## 2. Build One Row Per Project

Aggregate daily reports and expenditures into `processed/project_training_table.csv`.

Suggested project-level features:

- `planned_duration_days`
- `actual_duration_days`
- `total_boreholes`
- `completed_boreholes`
- `estimated_total_depth`
- `total_depth_done`
- `avg_depth_per_day`
- `reporting_days`
- `report_gap_count`
- `active_supervisor_count`
- `vendor_count`
- `machine_count`
- `machine_working_days`
- `total_spend`
- `spend_per_meter`
- `travel_total`
- `accommodation_total`
- `vehicle_hire_total`
- `sample_transport_total`
- `vendor_cost_total`
- `manpower_cost_total`

Labels:

- `was_delayed`
- `delay_days`
- `was_over_budget`
- `overrun_percent`

## 3. Train Baseline Models

Use rule-based analytics until enough completed historical data exists. Then train:

```python
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, mean_absolute_error
import pandas as pd
import joblib

df = pd.read_csv("ml_data/processed/project_training_table.csv")

features = [
    "planned_duration_days",
    "total_boreholes",
    "estimated_total_depth",
    "avg_depth_per_day",
    "reporting_days",
    "report_gap_count",
    "active_supervisor_count",
    "vendor_count",
    "machine_count",
    "total_spend",
    "spend_per_meter",
    "vendor_cost_total",
    "manpower_cost_total",
]

X = df[features].fillna(0)

y_delay = df["was_delayed"]
X_train, X_test, y_train, y_test = train_test_split(
    X, y_delay, test_size=0.2, random_state=42, stratify=y_delay
)
delay_model = RandomForestClassifier(n_estimators=200, random_state=42)
delay_model.fit(X_train, y_train)
print(classification_report(y_test, delay_model.predict(X_test)))
joblib.dump(delay_model, "ml_data/models/delay_model.pkl")

y_cost = df["was_over_budget"]
X_train, X_test, y_train, y_test = train_test_split(
    X, y_cost, test_size=0.2, random_state=42, stratify=y_cost
)
cost_model = RandomForestClassifier(n_estimators=200, random_state=42)
cost_model.fit(X_train, y_train)
print(classification_report(y_test, cost_model.predict(X_test)))
joblib.dump(cost_model, "ml_data/models/cost_model.pkl")

y_delay_days = df["delay_days"]
delay_days_model = RandomForestRegressor(n_estimators=200, random_state=42)
delay_days_model.fit(X, y_delay_days)
print(mean_absolute_error(y_delay_days, delay_days_model.predict(X)))
joblib.dump(delay_days_model, "ml_data/models/delay_days_model.pkl")
```

## 4. Backend Integration

Keep the existing endpoints:

- `/analytics/projects/{project_id}/delay-risk`
- `/analytics/projects/{project_id}/cost-risk`
- `/analytics/dashboard/insights`

When models are available, load `.pkl` files inside the analytics service and use model probabilities instead of the current rule score.
