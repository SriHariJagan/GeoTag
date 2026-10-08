import { createContext, useContext, useState, useCallback } from "react";
import {
  getVendors,
  getVendorById,
  createVendor,
  updateVendor,
  deleteVendor,
  changeVendorStatus,
} from "../../api/vendors.api";

const VendorContext = createContext();

export const VendorProvider = ({ children }) => {
  const [vendors, setVendors] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadVendors = useCallback(async (params) => {
    try {
      setLoading(true);
      setError(null);
      const res = await getVendors(params);
      setVendors(res.data || []);
      const t = Number(res.headers?.["x-total-count"]);
      setTotal(Number.isFinite(t) && t >= 0 ? t : (res.data || []).length);
      return res.data || [];
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchVendor = useCallback(async (id) => {
    const res = await getVendorById(id);
    return res.data;
  }, []);

  const addVendor = async (data) => {
    const res = await createVendor(data);
    await loadVendors();
    return res.data;
  };

  const editVendor = async (id, data) => {
    const res = await updateVendor(id, data);
    await loadVendors();
    return res.data;
  };

  const removeVendor = async (id) => {
    await deleteVendor(id);
    await loadVendors();
  };

  const setVendorStatus = async (id, status, reason) => {
    const res = await changeVendorStatus(id, status, reason);
    await loadVendors();
    return res.data;
  };

  return (
    <VendorContext.Provider
      value={{
        vendors,
        total,
        loading,
        error,
        loadVendors,
        fetchVendor,
        addVendor,
        editVendor,
        removeVendor,
        setVendorStatus,
      }}
    >
      {children}
    </VendorContext.Provider>
  );
};

export const useVendors = () => useContext(VendorContext);
