import { createContext, useContext, useState, useCallback } from "react";
import {
  getVendors,
  getVendorById,
  createVendor,
  updateVendor,
  deleteVendor,
  changeVendorStatus,
} from "../../api/vendors.api";
import {
  cached,
  invalidateQueryCache,
  queryKey,
} from "../../utils/queryCache";

const VendorContext = createContext();

export const VendorProvider = ({ children }) => {
  const [vendors, setVendors] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadVendors = useCallback(async (params = {}, { force = false } = {}) => {
    try {
      setLoading(true);
      setError(null);
      const payload = await cached(
        queryKey("vendors:list", params),
        () =>
          getVendors(params).then((res) => {
            const rows = res.data || [];
            const headerTotal = Number(res.headers?.["x-total-count"]);
            return {
              rows,
              total: Number.isFinite(headerTotal) && headerTotal >= 0
                ? headerTotal
                : rows.length,
            };
          }),
        { force }
      );
      setVendors(payload.rows);
      setTotal(payload.total);
      return payload.rows;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchVendor = useCallback(async (id, { force = false } = {}) => {
    const vendor = await cached(
      queryKey("vendors:detail", { id }),
      () => getVendorById(id).then((res) => res.data),
      { force }
    );
    return vendor;
  }, []);

  // Mutations invalidate cached reads; each page refetches with its own
  // filters/page so a mutation never replaces a filtered list with every vendor.
  const addVendor = async (data) => {
    const res = await createVendor(data);
    invalidateQueryCache("vendors:");
    return res.data;
  };

  const editVendor = async (id, data) => {
    const res = await updateVendor(id, data);
    invalidateQueryCache("vendors:");
    return res.data;
  };

  const removeVendor = async (id) => {
    await deleteVendor(id);
    invalidateQueryCache("vendors:");
  };

  const setVendorStatus = async (id, status, reason) => {
    const res = await changeVendorStatus(id, status, reason);
    invalidateQueryCache("vendors:");
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
