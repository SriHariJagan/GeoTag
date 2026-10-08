import { useEffect, useMemo, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import {
  FiCalendar,
  FiEdit2,
  FiFilter,
  FiPlus,
  FiRefreshCw,
  FiSettings,
  FiTool,
  FiTrash2,
  FiTruck,
  FiX,
} from "react-icons/fi";
import { useMachines } from "../../../store/context/MachineContext";
import Modal from "../../../Components/Modal/Modal";
import styles from "./Machinery.module.css";
import Pagination from "../../../Components/Pagination/Pagination";
import MachineryForm from "../../../Components/Forms/MachineryForm";

export default function Machinery() {
  const {
    machines = [],
    loading,
    loadMachines,
    addMachine,
    editMachine,
    removeMachine,
  } = useMachines();

  const location = useLocation();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModal, setIsDeleteModal] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState(null);

  const [filters, setFilters] = useState({
    machine_name: "",
    machine_type: "",
    status: "",
  });

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  useEffect(() => { setPage(1); }, [filters.machine_name, filters.machine_type, filters.status, pageSize]);

  useEffect(() => {
    loadMachines();
  }, [loadMachines]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const status = params.get("status");

    if (status) {
      setFilters((prev) => ({
        ...prev,
        status: status.toLowerCase(),
      }));
    }
  }, [location.search]);

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({
      ...prev,
      [name]: value,
    }));
  }, []);

  const clearFilters = () =>
    setFilters({ machine_name: "", machine_type: "", status: "" });

  const uniqueValues = useCallback(
    (key) => [...new Set(machines.map((m) => m[key]).filter(Boolean))],
    [machines]
  );

  const normalizeStatus = (status) => {
    const value = status?.toLowerCase();

    if (value === "active") return "working";
    if (value === "inactive") return "idle";

    return value || "";
  };

  const filteredData = useMemo(() => {
    return machines.filter((m) => {
      return (
        (!filters.machine_name || m.machine_name === filters.machine_name) &&
        (!filters.machine_type || m.machine_type === filters.machine_type) &&
        (!filters.status ||
          normalizeStatus(m.status) === normalizeStatus(filters.status))
      );
    });
  }, [machines, filters]);

  const pagedData = useMemo(() => {
    const startIdx = (page - 1) * pageSize;
    return filteredData.slice(startIdx, startIdx + pageSize);
  }, [filteredData, page, pageSize]);

  const stats = useMemo(() => {
    const total = machines.length;

    const working = machines.filter((m) =>
      ["working", "active"].includes(m.status?.toLowerCase())
    ).length;

    const idle = machines.filter((m) =>
      ["idle", "inactive"].includes(m.status?.toLowerCase())
    ).length;

    const maintenance = machines.filter(
      (m) => m.status?.toLowerCase() === "maintenance"
    ).length;

    return { total, working, idle, maintenance };
  }, [machines]);

  const formatDate = (date) => {
    if (!date) return "-";
    try {
      return new Date(date).toLocaleDateString();
    } catch {
      return "-";
    }
  };

  const getStatusClass = (status) => {
    switch (status?.toLowerCase()) {
      case "working":
      case "active":
        return styles.statusWorking;
      case "idle":
      case "inactive":
        return styles.statusIdle;
      case "maintenance":
        return styles.statusMaintenance;
      default:
        return styles.statusDefault;
    }
  };

  const handleSubmit = async (data) => {
    try {
      if (selectedMachine) {
        await editMachine(selectedMachine.id, data);
      } else {
        await addMachine(data);
      }

      setSelectedMachine(null);
      setIsModalOpen(false);
    } catch (error) {
      console.error("Machine save failed:", error);
    }
  };

  const confirmDelete = async () => {
    if (!selectedMachine) return;

    try {
      await removeMachine(selectedMachine.id);
      setSelectedMachine(null);
      setIsDeleteModal(false);
    } catch (error) {
      console.error("Delete failed:", error);
    }
  };

  const hasFilters =
    filters.machine_name || filters.machine_type || filters.status;

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>Asset Management</span>
          <h1>Machinery Overview</h1>
          <p>
            Track machine availability, maintenance status, assigned projects
            and field equipment usage in one modern workspace.
          </p>
        </div>

        <button
          className={styles.addBtn}
          onClick={() => {
            setSelectedMachine(null);
            setIsModalOpen(true);
          }}
        >
          <FiPlus />
          Add Machine
        </button>
      </div>

      <div className={styles.statsGrid}>
        <StatCard title="Total Machines" value={stats.total} icon={<FiTruck />} />
        <StatCard
          title="Working"
          value={stats.working}
          icon={<FiTool />}
          type="green"
        />
        <StatCard
          title="Maintenance"
          value={stats.maintenance}
          icon={<FiSettings />}
          type="orange"
        />
        <StatCard title="Idle" value={stats.idle} icon={<FiRefreshCw />} type="red" />
      </div>

      <div className={styles.toolbar}>
        <div className={styles.filterBox}>
          <FiTruck />
          <select
            name="machine_name"
            value={filters.machine_name}
            onChange={handleChange}
          >
            <option value="">Select Machine</option>
            {uniqueValues("machine_name").map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.filterBox}>
          <FiFilter />
          <select
            name="machine_type"
            value={filters.machine_type}
            onChange={handleChange}
          >
            <option value="">Select Type</option>
            {uniqueValues("machine_type").map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.filterBox}>
          <FiSettings />
          <select name="status" value={filters.status} onChange={handleChange}>
            <option value="">Select Status</option>
            <option value="working">Working</option>
            <option value="idle">Idle</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </div>

        {hasFilters && (
          <button className={styles.clearBtn} onClick={clearFilters}>
            <FiX />
            Clear Filters
          </button>
        )}
      </div>

      <div className={styles.contentCard}>
        <div className={styles.tableHeader}>
          <div>
            <h3>Machine List</h3>
            <p>
              Showing {pagedData.length} of {filteredData.length} machines · page {page}
            </p>
          </div>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Last Maintenance</th>
                <th>Status</th>
                <th>Projects</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6">
                    <div className={styles.loadingState}>
                      <div className={styles.loader}></div>
                      <p>Loading machines...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan="6">
                    <div className={styles.emptyState}>
                      <FiTruck />
                      <h3>No machines found</h3>
                      <p>Try changing filters or add a new machine.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                pagedData.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <div className={styles.machineCell}>
                        <div className={styles.machineIcon}>
                          <FiTruck />
                        </div>
                        <div>
                          <strong>{m.machine_name || "-"}</strong>
                          <span>Machine Asset</span>
                        </div>
                      </div>
                    </td>

                    <td>
                      <span className={styles.typeBadge}>
                        {m.machine_type || "-"}
                      </span>
                    </td>

                    <td>
                      <div className={styles.dateCell}>
                        <FiCalendar />
                        {formatDate(m.last_maintenance)}
                      </div>
                    </td>

                    <td>
                      <span
                        className={`${styles.statusBadge} ${getStatusClass(
                          m.status
                        )}`}
                      >
                        {m.status || "-"}
                      </span>
                    </td>

                    <td>
                      {m.project_names?.length > 0 ? (
                        <div className={styles.projectTags}>
                          {m.project_names.slice(0, 2).map((project) => (
                            <span key={project}>{project}</span>
                          ))}
                          {m.project_names.length > 2 && (
                            <span>+{m.project_names.length - 2}</span>
                          )}
                        </div>
                      ) : (
                        <span className={styles.emptyText}>—</span>
                      )}
                    </td>

                    <td>
                      <div className={styles.actionGroup}>
                        <button
                          className={styles.editBtn}
                          onClick={() => {
                            setSelectedMachine(m);
                            setIsModalOpen(true);
                          }}
                          title="Edit machine"
                        >
                          <FiEdit2 />
                        </button>

                        <button
                          className={styles.deleteBtn}
                          onClick={() => {
                            setSelectedMachine(m);
                            setIsDeleteModal(true);
                          }}
                          title="Delete machine"
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          page={page}
          total={filteredData.length}
          pageSize={pageSize}
          onPage={setPage}
          onPageSize={(n) => { setPageSize(n); setPage(1); }}
        />
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
        <MachineryForm initialData={selectedMachine} onSubmit={handleSubmit} />
      </Modal>

      <Modal isOpen={isDeleteModal} onClose={() => setIsDeleteModal(false)}>
        <div className={styles.deleteModal}>
          <div className={styles.deleteIcon}>
            <FiTrash2 />
          </div>

          <h3>Delete Machine?</h3>
          <p>
            Are you sure you want to delete{" "}
            <b>{selectedMachine?.machine_name}</b>? This action cannot be
            undone.
          </p>

          <div className={styles.confirmBtns}>
            <button
              className={styles.cancelBtn}
              onClick={() => setIsDeleteModal(false)}
            >
              Cancel
            </button>

            <button className={styles.confirmDeleteBtn} onClick={confirmDelete}>
              Delete
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function StatCard({ title, value, icon, type = "blue" }) {
  return (
    <div className={`${styles.statCard} ${styles[type]}`}>
      <div>
        <p>{title}</p>
        <h2>{value}</h2>
      </div>
      <span>{icon}</span>
    </div>
  );
}