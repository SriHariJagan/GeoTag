import { createContext, useCallback, useContext, useState } from "react";
import {
  getMyProjects,
  createProject,
  updateProject,
  deleteProject,
} from "../../api/projects.api";
import { cached, invalidateQueryCache } from "../../utils/queryCache";

const ProjectContext = createContext();
const PROJECTS_CACHE_KEY = "projects:mine";

// Normalize project data for forms
const normalizeProject = (p) => ({
  ...p,
  supervisor_ids: p.supervisors?.map((s) => s.id) || [],
  machine_ids: p.machinery?.map((m) => m.id) || [],
  vendor_ids: p.vendors?.map((v) => v.id) || [],
});

export const ProjectProvider = ({ children }) => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);

  // Load all projects for current user (cached; pass force to refetch)
  const loadProjects = useCallback(async ({ force = false } = {}) => {
    try {
      setLoading(true);
      const rows = await cached(
        PROJECTS_CACHE_KEY,
        () => getMyProjects().then((res) => (res.data || []).map(normalizeProject)),
        { force }
      );
      setProjects(rows);
      return rows;
    } catch (err) {
      console.error("Failed to load projects", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Add new project
  const addProject = async (data) => {
    try {
      const res = await createProject(data);
      invalidateQueryCache("projects:");
      setProjects((prev) => [...prev, normalizeProject(res.data)]);
    } catch (err) {
      console.error("Failed to add project", err);
      throw err;
    }
  };

  // Update existing project
  const editProject = async (id, data) => {
    try {
      const res = await updateProject(id, data);
      invalidateQueryCache("projects:");
      setProjects((prev) =>
        prev.map((p) => (p.id === id ? normalizeProject(res.data) : p))
      );
    } catch (err) {
      console.error("Failed to update project", err);
      throw err;
    }
  };

  // Delete project
  const removeProject = async (id) => {
    try {
      await deleteProject(id);
      invalidateQueryCache("projects:");
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      console.error("Failed to delete project", err);
      throw err;
    }
  };

  return (
    <ProjectContext.Provider
      value={{
        projects,
        loading,
        loadProjects,
        addProject,
        updateProject: editProject,
        deleteProject: removeProject,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
};

export const useProjects = () => useContext(ProjectContext);