import api from "./axios";

// RFQs
export const createRFQ = (data) => api.post("/rfqs", data);
export const listRFQs = (params) => api.get("/rfqs", { params });
export const getRFQ = (id) => api.get(`/rfqs/${id}`);
export const updateRFQ = (id, data) => api.put(`/rfqs/${id}`, data);
export const sendRFQ = (id, vendorIds) =>
  api.post(`/rfqs/${id}/send`, { vendor_ids: vendorIds });
export const closeRFQ = (id) => api.post(`/rfqs/${id}/close`);
export const cancelRFQ = (id) => api.post(`/rfqs/${id}/cancel`);
export const addRFQItem = (id, data) => api.post(`/rfqs/${id}/items`, data);
export const listRFQVendors = (id) => api.get(`/rfqs/${id}/vendors`);
export const markRFQViewed = (id, vendorId) =>
  api.post(`/rfqs/${id}/viewed`, null, { params: { vendor_id: vendorId } });
export const declineRFQ = (id, vendorId) =>
  api.post(`/rfqs/${id}/decline`, null, { params: { vendor_id: vendorId } });

// Quotations
export const submitQuotation = (data) => api.post("/quotations", data);
export const listRFQQuotations = (rfqId) => api.get(`/rfqs/${rfqId}/quotations`);
export const getQuotation = (id) => api.get(`/quotations/${id}`);
export const compareQuotations = (rfqId) => api.get(`/rfqs/${rfqId}/compare`);
export const addQuotationDocument = (id, data) =>
  api.post(`/quotations/${id}/documents`, data);

// Evaluation + award
export const evaluateQuotation = (id, data) =>
  api.post(`/quotations/${id}/evaluate`, data);
export const awardQuotation = (rfqId, data) => api.post(`/rfqs/${rfqId}/award`, data);
export const getAward = (rfqId) => api.get(`/rfqs/${rfqId}/award`);

// Work orders (wizard + direct + award-linked)
export const createWorkOrder = (data) => api.post("/work-orders", data);
export const updateWorkOrder = (id, data) => api.put(`/work-orders/${id}`, data);
export const listWorkOrders = (params) => api.get("/work-orders", { params });
export const getWorkOrder = (id) => api.get(`/work-orders/${id}`);
export const issueWorkOrder = (id) => api.post(`/work-orders/${id}/issue`);
export const viewedWorkOrder = (id) => api.post(`/work-orders/${id}/viewed`);
export const acceptWorkOrder = (id) => api.post(`/work-orders/${id}/accept`);
export const rejectWorkOrder = (id) => api.post(`/work-orders/${id}/reject`);
export const progressWorkOrder = (id) => api.post(`/work-orders/${id}/progress`);
export const completeWorkOrder = (id) => api.post(`/work-orders/${id}/complete`);
export const closeWorkOrder = (id) => api.post(`/work-orders/${id}/close`);
export const cancelWorkOrder = (id) => api.post(`/work-orders/${id}/cancel`);
export const reviewWorkOrder = (id) => api.post(`/work-orders/${id}/review`);
export const sendWorkOrder = (id, vendorIds) =>
  api.post(`/work-orders/${id}/send`, { vendor_ids: vendorIds });
export const listWorkOrderVendors = (id) => api.get(`/work-orders/${id}/vendors`);
export const respondWorkOrder = (id, vendorId, accept, rejectionReason) =>
  api.post(`/work-orders/${id}/vendor-response`, {
    vendor_id: vendorId,
    accept,
    rejection_reason: rejectionReason || null,
  });
export const markWorkOrderViewedByVendor = (id, vendorId) =>
  api.post(`/work-orders/${id}/viewed-vendor`, null, { params: { vendor_id: vendorId } });
export const generateWorkOrderPdf = (id) => api.post(`/work-orders/${id}/pdf/generate`);
export const workOrderPdfPreviewUrl = (id) => `/work-orders/${id}/pdf/preview`;
export const workOrderPdfDownloadUrl = (id) => `/work-orders/${id}/pdf/download`;
export const signWorkOrder = (id, signatureData) =>
  api.post(`/work-orders/${id}/sign`, { signature_data: signatureData || null });
export const stampWorkOrder = (id, stampData) =>
  api.post(`/work-orders/${id}/stamp`, { stamp_data: stampData || null });
export const finalizeWorkOrder = (id) => api.post(`/work-orders/${id}/finalize`);
export const listWorkOrderVersions = (id) => api.get(`/work-orders/${id}/versions`);
export const eligibleVendors = (params) =>
  api.get("/work-orders/vendors/eligible", { params });
export const listStandardTerms = () => api.get("/standard-terms");
export const createStandardTerm = (data) => api.post("/standard-terms", data);

// Corporate document module (V5)
export const nextWoNumber = (projectId) =>
  api.get("/work-orders/numbering/next", { params: { project_id: projectId } });
export const getWoDocument = (id) => api.get(`/work-orders/${id}/document`);
export const listWoDocuments = (id) => api.get(`/work-orders/${id}/documents`);
export const uploadWoDocument = (id, file, documentType = "SIGNED") => {
  const fd = new FormData();
  fd.append("file", file);
  return api.post(`/work-orders/${id}/documents`, fd, {
    params: { document_type: documentType },
    headers: { "Content-Type": "multipart/form-data" },
  });
};
export const verifyWoDocument = (docId) =>
  api.get(`/work-order-documents/${docId}/verify`);
export const downloadWoDocumentUrl = (docId) =>
  `/work-order-documents/${docId}/download`;
export const cloneWoVersion = (id) => api.post(`/work-orders/${id}/new-version`);
export const duplicateWo = (id, projectId, workOrderNumber) =>
  api.post(`/work-orders/${id}/duplicate`, null, {
    params: {
      ...(projectId ? { project_id: projectId } : {}),
      ...(workOrderNumber ? { work_order_number: workOrderNumber } : {}),
    },
  });

// Client-side BOQ preview (mirrors backend _compute_wo_totals; server is authoritative)
export const previewWoTotals = (items = [], discount = 0, tax = 0, other = 0) => {
  let subtotal = 0;
  for (const it of items) {
    const qty = Number(it.quantity) || 0;
    const rate = Number(it.unit_rate) || 0;
    subtotal += qty * rate;
  }
  subtotal = Math.round(subtotal * 100) / 100;
  const d = Number(discount) || 0;
  const t = Number(tax) || 0;
  const o = Number(other) || 0;
  return { subtotal, discount: d, tax: t, other: o, grand: Math.round((subtotal - d + t + o) * 100) / 100 };
};

// Vendor assignments (read-only; acceptance is the only writer)
export const listVendorAssignments = (params) =>
  api.get("/project-vendor-assignments", { params });
export const endVendorAssignment = (id, status, reason) =>
  api.post(`/project-vendor-assignments/${id}/end`, null, {
    params: { status, reason },
  });

/* ================= AUTHENTICATED FILE ACCESS =================
   These endpoints sit behind Bearer auth, so a plain <a href> loses the token
   and returns {"detail":"Not authenticated"}. Fetch the file through axios
   (which attaches the token) and hand the browser a blob URL instead. */

/** Open a protected file in a new tab. Reserves the tab synchronously so the
    popup blocker treats it as user-initiated, then navigates to the blob. */
export const openAuthedFile = async (path) => {
  const win = window.open("", "_blank");
  try {
    const res = await api.get(path, { responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    if (win) win.location.href = url;
    else window.open(url, "_blank");
    return true;
  } catch (err) {
    if (win) win.close();
    throw err;
  }
};

/** Download a protected file, keeping the filename from the response header. */
export const downloadAuthedFile = async (path, fallbackName = "document.pdf") => {
  const res = await api.get(path, { responseType: "blob" });
  const disposition = res.headers?.["content-disposition"] || "";
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  const name = match ? decodeURIComponent(match[1]) : fallbackName;
  const url = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
};

/** Inline <img> URL for a protected asset (e.g. the company logo). */
export const authedAssetUrl = async (path) => {
  const res = await api.get(path, { responseType: "blob" });
  return URL.createObjectURL(res.data);
};