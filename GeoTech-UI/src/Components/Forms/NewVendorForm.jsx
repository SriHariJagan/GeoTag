// Components/Forms/NewVendorForm.js
import { useState, useEffect } from "react";
import styles from "./Forms.module.css";

const defaultFormState = {
  vendor_company: "",
  legal_business_name: "",
  contactPerson: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  status: "ACTIVE",
  service_categories: "",
  vendorCode: "",
  rating: 0,
};

const STATUSES = ["ACTIVE", "PROSPECT", "SUSPENDED", "BLACKLISTED"];

const NewVendorForm = ({ initialData = null, onSubmit }) => {
  const [formData, setFormData] = useState(defaultFormState);

  // Populate form in Edit mode
  useEffect(() => {
    if (initialData) {
      setFormData({
        vendor_company: initialData.vendor_company ?? "",
        legal_business_name:
          initialData.legal_business_name ?? initialData.vendor_company ?? "",
        contactPerson: initialData.contact_person ?? "",
        phone: initialData.phone ?? "",
        email: initialData.email ?? "",
        address: initialData.address ?? "",
        city: initialData.city ?? "",
        status: initialData.status ?? "ACTIVE",
        service_categories: initialData.service_categories ?? "",
        vendorCode: initialData.vendor_code ?? "",
        rating: initialData.rating ?? 0,
      });
    } else {
      setFormData(defaultFormState);
    }
  }, [initialData]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]:
        name === "depthHardRock" || name === "depthSoftRock"
          ? Number(value)
          : value,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!formData.vendor_company || !formData.contactPerson || !formData.phone) {
      alert("Vendor Company, Contact Person, and Phone are required");
      return;
    }

    const payload = {
      vendor_company: formData.vendor_company,
      legal_business_name:
        formData.legal_business_name || formData.vendor_company,
      contact_person: formData.contactPerson,
      phone: formData.phone,
      email: formData.email,
      address: formData.address,
      city: formData.city || undefined,
      status: formData.status || "ACTIVE",
      service_categories: formData.service_categories || undefined,
      vendor_code: formData.vendorCode || undefined,
      rating: Number(formData.rating) || 0,
      is_active: false,
    };

    onSubmit(payload);

    if (!initialData) {
      setFormData(defaultFormState);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h2>{initialData ? "Edit Vendor" : "Add Vendor"}</h2>

      <div className={styles.row}>
        <div className={styles.field}>
          <label>Vendor Code</label>
          <input
            type="text"
            name="vendorCode"
            value={formData.vendorCode}
            onChange={handleChange}
            placeholder="Must be unique"
          />
        </div>

        <div className={styles.field}>
          <label>Company Name *</label>
          <input
            type="text"
            name="vendor_company"
            value={formData.vendor_company}
            onChange={handleChange}
            required
          />
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label>Legal Business Name</label>
          <input
            type="text"
            name="legal_business_name"
            value={formData.legal_business_name}
            onChange={handleChange}
            placeholder="Defaults to company name"
          />
        </div>

        <div className={styles.field}>
          <label>Status</label>
          <select name="status" value={formData.status} onChange={handleChange}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label>City</label>
          <input
            type="text"
            name="city"
            value={formData.city}
            onChange={handleChange}
          />
        </div>

        <div className={styles.field}>
          <label>Service Categories (comma-separated)</label>
          <input
            type="text"
            name="service_categories"
            value={formData.service_categories}
            onChange={handleChange}
            placeholder="DRILLING, TRANSPORTATION"
          />
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label>Contact Person</label>
          <input
            type="text"
            name="contactPerson"
            value={formData.contactPerson}
            onChange={handleChange}
            required
          />
        </div>

        <div className={styles.field}>
          <label>Phone</label>
          <input
            type="text"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            required
          />
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label>Email</label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
          />
        </div>

        <div className={styles.field}>
          <label>Address</label>
          <input
            type="text"
            name="address"
            value={formData.address}
            onChange={handleChange}
          />
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label>Rating</label>
          <input
            type="number"
            name="rating"
            value={formData.rating || 0}
            onChange={handleChange}
            min={0}
            max={5}
          />
        </div>
      </div>

      <div className={styles.actions}>
        <button type="submit" className={styles.submitBtn}>
          {initialData ? "Update Vendor" : "Add Vendor"}
        </button>
      </div>
    </form>
  );
};

export default NewVendorForm;
