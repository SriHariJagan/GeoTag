import { createContext, useCallback, useContext, useState } from "react";
import {
  getMyProjects,
  createProject,
  updateProject,
  deleteProject,
} from "../../api/projects.api";

const ProjectContext = createContext();

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

  // Load all projects for current user
  const loadProjects = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getMyProjects();
      setProjects((res.data || []).map(normalizeProject));
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