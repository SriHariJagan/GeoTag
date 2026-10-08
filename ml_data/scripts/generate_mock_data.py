from __future__ import annotations

import csv
import random
from datetime import date, timedelta
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "raw"
PROCESSED_DIR = ROOT / "processed"


def write_csv(path: Path, rows: list[dict]):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def iso(day: date) -> str:
    return day.isoformat()


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def generate(project_count: int = 500, seed: int = 42):
    random.seed(seed)
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

    locations = [
        "Hyderabad",
        "Vijayawada",
        "Bengaluru",
        "Chennai",
        "Pune",
        "Nagpur",
        "Visakhapatnam",
        "Warangal",
    ]
    clients = ["Metro Rail", "NHAI", "L&T", "State PWD", "Irrigation Dept", "Airport Authority"]
    weather_options = ["clear", "cloudy", "rain", "heavy_rain", "hot", "windy"]
    rig_types = ["Rotary", "DTH", "Hydraulic", "Crawler"]

    vendors = []
    vendor_profiles = {}
    for vendor_id in range(1, 31):
        speed_factor = random.uniform(0.75, 1.25)
        cost_factor = random.uniform(0.8, 1.35)
        vendor_profiles[vendor_id] = {
            "speed_factor": speed_factor,
            "cost_factor": cost_factor,
        }
        vendors.append(
            {
                "vendor_id": vendor_id,
                "vendor_company": f"Vendor {vendor_id:02d} Drilling",
                "contact_person": f"Vendor Contact {vendor_id:02d}",
                "location": random.choice(locations),
                "rating": round(clamp(3.0 + speed_factor - cost_factor + random.random(), 1, 5), 1),
                "is_active": 1,
            }
        )

    machinery = []
    machine_profiles = {}
    for machine_id in range(1, 46):
        reliability = random.uniform(0.75, 1.1)
        machine_profiles[machine_id] = {"reliability": reliability}
        machinery.append(
            {
                "machine_id": machine_id,
                "machine_name": f"RIG-{machine_id:03d}",
                "machine_type": random.choice(rig_types),
                "last_maintenance": iso(date(2025, 1, 1) + timedelta(days=random.randint(0, 360))),
                "status": random.choice(["working", "active", "working", "maintenance"]),
            }
        )

    supervisors = []
    supervisor_profiles = {}
    for supervisor_id in range(1, 41):
        consistency = random.uniform(0.75, 1.15)
        supervisor_profiles[supervisor_id] = {"consistency": consistency}
        supervisors.append(
            {
                "supervisor_id": supervisor_id,
                "full_name": f"Supervisor {supervisor_id:02d}",
                "email": f"supervisor{supervisor_id:02d}@example.com",
                "is_active": 1,
            }
        )

    projects = []
    daily_reports = []
    expenditures = []
    training_rows = []

    report_id = 1
    expenditure_id = 1

    for project_id in range(1, project_count + 1):
        planned_start = date(2025, 1, 1) + timedelta(days=random.randint(0, 420))
        total_boreholes = random.randint(6, 40)
        estimated_total_depth = total_boreholes * random.uniform(18, 45)
        target_depth_per_day = random.uniform(14, 32)
        planned_duration = max(8, round(estimated_total_depth / target_depth_per_day))
        planned_end = planned_start + timedelta(days=planned_duration - 1)

        vendor_ids = random.sample(range(1, 31), random.randint(1, 3))
        machine_ids = random.sample(range(1, 46), random.randint(1, 3))
        supervisor_ids = random.sample(range(1, 41), random.randint(1, 3))

        vendor_speed = sum(vendor_profiles[v]["speed_factor"] for v in vendor_ids) / len(vendor_ids)
        machine_reliability = sum(machine_profiles[m]["reliability"] for m in machine_ids) / len(machine_ids)
        supervisor_consistency = sum(supervisor_profiles[s]["consistency"] for s in supervisor_ids) / len(supervisor_ids)
        site_difficulty = random.uniform(0.75, 1.45)
        rain_penalty = random.uniform(0.85, 1.0)

        actual_depth_per_day = target_depth_per_day * vendor_speed * machine_reliability * supervisor_consistency * rain_penalty / site_difficulty
        actual_depth_per_day = max(actual_depth_per_day, 4)
        actual_duration = max(4, round(estimated_total_depth / actual_depth_per_day))
        actual_start = planned_start + timedelta(days=random.choice([0, 0, 0, 1, 2, 3]))
        actual_end = actual_start + timedelta(days=actual_duration - 1)
        was_delayed = int(actual_end > planned_end)
        delay_days = max((actual_end - planned_end).days, 0)

        base_cost_per_meter = random.uniform(1350, 2600)
        vendor_cost_factor = sum(vendor_profiles[v]["cost_factor"] for v in vendor_ids) / len(vendor_ids)
        project_budget = estimated_total_depth * base_cost_per_meter * random.uniform(0.92, 1.18)
        actual_total_cost = estimated_total_depth * base_cost_per_meter * vendor_cost_factor * random.uniform(0.9, 1.25)
        was_over_budget = int(actual_total_cost > project_budget)
        overrun_percent = (actual_total_cost - project_budget) / project_budget

        completed_boreholes = total_boreholes
        status = "completed"
        location = random.choice(locations)

        projects.append(
            {
                "project_id": project_id,
                "project_code": f"GT-{project_id:04d}",
                "name": f"GeoTech Project {project_id:04d}",
                "location": location,
                "client_name": random.choice(clients),
                "planned_start_date": iso(planned_start),
                "planned_end_date": iso(planned_end),
                "actual_start_date": iso(actual_start),
                "actual_end_date": iso(actual_end),
                "total_boreholes": total_boreholes,
                "completed_boreholes": completed_boreholes,
                "estimated_total_depth": round(estimated_total_depth, 2),
                "target_depth_per_day": round(target_depth_per_day, 2),
                "target_boreholes_per_day": round(total_boreholes / planned_duration, 2),
                "project_budget": round(project_budget, 2),
                "status": status,
            }
        )

        total_depth_done = 0.0
        reporting_days = 0
        report_gap_count = 0
        travel_total = accommodation_total = vehicle_hire_total = sample_transport_total = 0.0
        vendor_cost_total = manpower_cost_total = 0.0

        current_day = actual_start
        while current_day <= actual_end:
            # Some missed report days create realistic reporting gaps.
            if random.random() > 0.92:
                report_gap_count += 1
                current_day += timedelta(days=1)
                continue

            weather = random.choices(
                weather_options,
                weights=[45, 18, 14, 5, 14, 4],
                k=1,
            )[0]
            weather_factor = {"clear": 1.0, "cloudy": 0.95, "rain": 0.75, "heavy_rain": 0.45, "hot": 0.9, "windy": 0.85}[weather]
            day_depth = max(0, random.gauss(actual_depth_per_day * weather_factor, 3.5))
            remaining_depth = max(estimated_total_depth - total_depth_done, 0)
            day_depth = min(day_depth, remaining_depth)

            if day_depth <= 0:
                break

            soil_share = random.uniform(0.2, 0.55)
            soft_share = random.uniform(0.2, 0.5)
            soil_depth = day_depth * soil_share
            soft_rock_depth = day_depth * soft_share
            hard_rock_depth = max(day_depth - soil_depth - soft_rock_depth, 0)

            vendor_id = random.choice(vendor_ids)
            machine_id = random.choice(machine_ids)
            supervisor_id = random.choice(supervisor_ids)
            borehole_no = f"BH-{min(total_boreholes, int((total_depth_done / estimated_total_depth) * total_boreholes) + 1):02d}"
            work_status = "working"
            delay_reason = ""
            if weather in {"rain", "heavy_rain"} or day_depth < target_depth_per_day * 0.55:
                work_status = random.choice(["slow", "blocked", "working"])
                delay_reason = random.choice(["weather", "machine idle", "site access", "client clearance", ""])

            daily_reports.append(
                {
                    "report_id": report_id,
                    "project_id": project_id,
                    "report_date": iso(current_day),
                    "supervisor_id": supervisor_id,
                    "vendor_id": vendor_id,
                    "machine_id": machine_id,
                    "site_location": location,
                    "borehole_no": borehole_no,
                    "rig_no": f"RIG-{machine_id:03d}",
                    "type_of_rig": machine_profiles[machine_id].get("machine_type", random.choice(rig_types)),
                    "chainage": f"{random.randint(0, 12)}+{random.randint(0, 999):03d}",
                    "depth_started": round(total_depth_done, 2),
                    "soil_depth": round(soil_depth, 2),
                    "soft_rock_depth": round(soft_rock_depth, 2),
                    "hard_rock_depth": round(hard_rock_depth, 2),
                    "total_depth": round(day_depth, 2),
                    "hours_worked": round(random.uniform(5.5, 10), 1),
                    "manpower_count": random.randint(4, 12),
                    "weather_condition": weather,
                    "work_status": work_status,
                    "delay_reason": delay_reason,
                }
            )
            report_id += 1
            reporting_days += 1
            total_depth_done += day_depth

            vendor_cost = day_depth * base_cost_per_meter * vendor_profiles[vendor_id]["cost_factor"] * random.uniform(0.55, 0.75)
            manpower_cost = random.uniform(3500, 9500)
            travel = random.uniform(500, 4500)
            accommodation = random.uniform(800, 5000)
            vehicle_hire = random.uniform(1000, 6500)
            sample_transport = random.uniform(300, 3500)
            misc = random.uniform(0, 2500)
            grand_total = vendor_cost + manpower_cost + travel + accommodation + vehicle_hire + sample_transport + misc

            expenditures.append(
                {
                    "expenditure_id": expenditure_id,
                    "project_id": project_id,
                    "date": iso(current_day),
                    "supervisor_id": supervisor_id,
                    "vendor_id": vendor_id,
                    "travel": round(travel, 2),
                    "accommodation": round(accommodation, 2),
                    "da": round(random.uniform(300, 1200), 2),
                    "vehicle_hire": round(vehicle_hire, 2),
                    "jcb_hydra_other": round(random.uniform(0, 4000), 2),
                    "tractor_trolly_water": round(random.uniform(0, 2500), 2),
                    "local_vehicle_hire": round(random.uniform(0, 3000), 2),
                    "sample_transport": round(sample_transport, 2),
                    "misc": round(misc, 2),
                    "manpower_cost": round(manpower_cost, 2),
                    "vendor_cost": round(vendor_cost, 2),
                    "grand_total": round(grand_total, 2),
                }
            )
            expenditure_id += 1

            travel_total += travel
            accommodation_total += accommodation
            vehicle_hire_total += vehicle_hire
            sample_transport_total += sample_transport
            vendor_cost_total += vendor_cost
            manpower_cost_total += manpower_cost

            current_day += timedelta(days=1)

        spend_per_meter = (actual_total_cost / estimated_total_depth) if estimated_total_depth else 0
        training_rows.append(
            {
                "project_id": project_id,
                "planned_duration_days": planned_duration,
                "actual_duration_days": actual_duration,
                "total_boreholes": total_boreholes,
                "completed_boreholes": completed_boreholes,
                "estimated_total_depth": round(estimated_total_depth, 2),
                "target_depth_per_day": round(target_depth_per_day, 2),
                "total_depth_done": round(total_depth_done, 2),
                "avg_depth_per_day": round(total_depth_done / max(reporting_days, 1), 2),
                "reporting_days": reporting_days,
                "report_gap_count": report_gap_count,
                "active_supervisor_count": len(supervisor_ids),
                "vendor_count": len(vendor_ids),
                "machine_count": len(machine_ids),
                "project_budget": round(project_budget, 2),
                "total_spend": round(actual_total_cost, 2),
                "spend_per_meter": round(spend_per_meter, 2),
                "travel_total": round(travel_total, 2),
                "accommodation_total": round(accommodation_total, 2),
                "vehicle_hire_total": round(vehicle_hire_total, 2),
                "sample_transport_total": round(sample_transport_total, 2),
                "vendor_cost_total": round(vendor_cost_total, 2),
                "manpower_cost_total": round(manpower_cost_total, 2),
                "was_delayed": was_delayed,
                "delay_days": delay_days,
                "was_over_budget": was_over_budget,
                "overrun_percent": round(overrun_percent, 4),
                "projected_total_cost": round(actual_total_cost, 2),
            }
        )

    write_csv(RAW_DIR / "projects.csv", projects)
    write_csv(RAW_DIR / "daily_reports.csv", daily_reports)
    write_csv(RAW_DIR / "expenditures.csv", expenditures)
    write_csv(RAW_DIR / "vendors.csv", vendors)
    write_csv(RAW_DIR / "machinery.csv", machinery)
    write_csv(RAW_DIR / "supervisors.csv", supervisors)
    write_csv(PROCESSED_DIR / "project_training_table.csv", training_rows)

    print(f"Generated {len(projects)} projects")
    print(f"Generated {len(daily_reports)} daily reports")
    print(f"Generated {len(expenditures)} expenditure rows")
    print(f"Training table: {PROCESSED_DIR / 'project_training_table.csv'}")


if __name__ == "__main__":
    generate()
