from __future__ import annotations

import json
from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.metrics import accuracy_score, mean_absolute_error, r2_score, roc_auc_score
from sklearn.model_selection import train_test_split


ROOT = Path(__file__).resolve().parents[1]
PROCESSED_DIR = ROOT / "processed"
MODELS_DIR = ROOT / "models"
REPORTS_DIR = ROOT / "reports"

FEATURES = [
    "planned_duration_days",
    "total_boreholes",
    "completed_boreholes",
    "estimated_total_depth",
    "target_depth_per_day",
    "total_depth_done",
    "avg_depth_per_day",
    "reporting_days",
    "report_gap_count",
    "active_supervisor_count",
    "vendor_count",
    "machine_count",
    "project_budget",
    "total_spend",
    "spend_per_meter",
    "travel_total",
    "accommodation_total",
    "vehicle_hire_total",
    "sample_transport_total",
    "vendor_cost_total",
    "manpower_cost_total",
]


def split(X, y, classification: bool):
    stratify = y if classification and y.nunique() > 1 and y.value_counts().min() >= 2 else None
    return train_test_split(X, y, test_size=0.2, random_state=42, stratify=stratify)


def train_classifier(name: str, X: pd.DataFrame, y: pd.Series):
    X_train, X_test, y_train, y_test = split(X, y, classification=True)
    model = RandomForestClassifier(
        n_estimators=300,
        min_samples_leaf=3,
        random_state=42,
        class_weight="balanced",
    )
    model.fit(X_train, y_train)

    predictions = model.predict(X_test)
    probabilities = model.predict_proba(X_test)[:, 1]
    metrics = {
        "accuracy": round(float(accuracy_score(y_test, predictions)), 4),
        "roc_auc": round(float(roc_auc_score(y_test, probabilities)), 4)
        if y_test.nunique() > 1
        else None,
    }
    joblib.dump(model, MODELS_DIR / f"{name}.pkl")
    return metrics


def train_regressor(name: str, X: pd.DataFrame, y: pd.Series):
    X_train, X_test, y_train, y_test = split(X, y, classification=False)
    model = RandomForestRegressor(
        n_estimators=300,
        min_samples_leaf=3,
        random_state=42,
    )
    model.fit(X_train, y_train)

    predictions = model.predict(X_test)
    metrics = {
        "mae": round(float(mean_absolute_error(y_test, predictions)), 4),
        "r2": round(float(r2_score(y_test, predictions)), 4),
    }
    joblib.dump(model, MODELS_DIR / f"{name}.pkl")
    return metrics


def train():
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    data_path = PROCESSED_DIR / "project_training_table.csv"
    df = pd.read_csv(data_path)
    X = df[FEATURES].fillna(0)

    metrics = {
        "rows": int(len(df)),
        "features": FEATURES,
        "delay_classifier": train_classifier("delay_classifier", X, df["was_delayed"]),
        "delay_days_forecaster": train_regressor("delay_days_forecaster", X, df["delay_days"]),
        "cost_overrun_classifier": train_classifier("cost_overrun_classifier", X, df["was_over_budget"]),
        "projected_cost_forecaster": train_regressor("projected_cost_forecaster", X, df["projected_total_cost"]),
        "overrun_percent_forecaster": train_regressor("overrun_percent_forecaster", X, df["overrun_percent"]),
    }

    with (MODELS_DIR / "feature_columns.json").open("w", encoding="utf-8") as handle:
        json.dump(FEATURES, handle, indent=2)

    with (REPORTS_DIR / "training_metrics.json").open("w", encoding="utf-8") as handle:
        json.dump(metrics, handle, indent=2)

    print(json.dumps(metrics, indent=2))
    print(f"Saved models to {MODELS_DIR}")


if __name__ == "__main__":
    train()
