// Components/Forms/NewVendorForm.js
import { useState, useEffect } from "react";
import { FiPlus, FiStar, FiTrash2 } from "react-icons/fi";
import styles from "./Forms.module.css";

const blankContact = () => ({
  name: "",
  designation: "",
  phone: "",
  email: "",
  is_primary: false,
});

const defaultFormState = {
  vendor_company: "",
  legal_business_name: "",
  address: "",
  city: "",
  status: "ACTIVE",
  service_categories: "",
  vendorCode: "",
  rating: 0,
  contacts: [{ ...blankContact(), is_primary: true }],
};

const STATUSES = ["ACTIVE", "PROSPECT", "SUSPENDED", "BLACKLISTED"];

const contactsFromVendor = (vendor) => {
  const rows = (vendor?.contacts || []).map((c) => ({
    name: c.name ?? "",
    designation: c.designation ?? "",
    phone: c.phone ?? "",
    email: c.email ?? "",
    is_primary: Boolean(c.is_primary),
  }));
  if (rows.length > 0) {
    if (!rows.some((c) => c.is_primary)) rows[0].is_primary = true;
    return rows;
  }
  // Legacy vendors keep a single contact on the vendor row — adopt it.
  if (vendor?.contact_person || vendor?.phone || vendor?.email) {
    return [{
      name: vendor.contact_person ?? "",
      designation: vendor.contact_designation ?? "",
      phone: vendor.phone ?? "",
      email: vendor.email ?? "",
      is_primary: true,
    }];
  }
  // Editing a legacy vendor without contacts stays opt-in: show an empty
  // section, not a blank mandatory card. New vendors start with one row.
  return [];
};

const NewVendorForm = ({ initialData = null, onSubmit }) => {
  const [formData, setFormData] = useState(defaultFormState);
  const [error, setError] = useState("");

  // Populate form in Edit mode
  useEffect(() => {
    if (initialData) {
      setFormData({
        vendor_company: initialData.vendor_company ?? "",
        legal_business_name:
          initialData.legal_business_name ?? initialData.vendor_company ?? "",
        address: initialData.address ?? "",
        city: initialData.city ?? "",
        status: initialData.status ?? "ACTIVE",
        service_categories: initialData.service_categories ?? "",
        vendorCode: initialData.vendor_code ?? "",
        rating: initialData.rating ?? 0,
        contacts: contactsFromVendor(initialData),
      });
    } else {
      setFormData(defaultFormState);
    }
    setError("");
  }, [initialData]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const setContact = (index, field, value) => {
    setFormData((prev) => ({
      ...prev,
      contacts: prev.contacts.map((c, i) =>
        i === index ? { ...c, [field]: value } : c
      ),
    }));
  };

  const setPrimary = (index) => {
    setFormData((prev) => ({
      ...prev,
      contacts: prev.contacts.map((c, i) => ({
        ...c,
        is_primary: i === index,
      })),
    }));
  };

  const addContact = () => {
    setFormData((prev) => ({
      ...prev,
      contacts: [
        ...prev.contacts,
        {
          ...blankContact(),
          // First contact added to a legacy vendor becomes the primary.
          is_primary: prev.contacts.length === 0,
        },
      ],
    }));
  };

  const removeContact = (index) => {
    setFormData((prev) => {
      if (prev.contacts.length === 1) return prev;
      const next = prev.contacts.filter((_, i) => i !== index);
      if (!next.some((c) => c.is_primary)) {
        next[0] = { ...next[0], is_primary: true };
      }
      return { ...prev, contacts: next };
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");

    if (!formData.vendor_company.trim()) {
      setError("Vendor company name is required.");
      return;
    }

    // Drop untouched optional rows so a blank "Contact 2" card never blocks
    // saving with a server-side "name required" validation error.
    const contacts = formData.contacts
      .map((c) => ({
        name: (c.name || "").trim(),
        designation: (c.designation || "").trim() || undefined,
        phone: (c.phone || "").trim() || undefined,
        email: (c.email || "").trim() || undefined,
        is_primary: Boolean(c.is_primary),
      }))
      .filter((c) => c.name || c.designation || c.phone || c.email);

    if (!initialData && contacts.length === 0) {
      setError("Add at least one contact person with a name.");
      return;
    }
    if (contacts.length > 0) {
      if (contacts.some((c) => !c.name)) {
        setError("Every contact person must have a name.");
        return;
      }
      if (!contacts.some((c) => c.is_primary)) contacts[0].is_primary = true;
      if (contacts.filter((c) => c.is_primary).length !== 1) {
        setError("Mark exactly one contact as the primary contact.");
        return;
      }
      if (!contacts.some((c) => c.phone)) {
        setError("At least one contact must include a phone number.");
        return;
      }
    }

    const primary =
      contacts.find((c) => c.is_primary) || contacts[0];

    const payload = {
      vendor_company: formData.vendor_company.trim(),
      legal_business_name:
        (formData.legal_business_name || formData.vendor_company).trim(),
      address: formData.address,
      city: formData.city || undefined,
      status: formData.status || "ACTIVE",
      service_categories: formData.service_categories || undefined,
      vendor_code: formData.vendorCode || undefined,
      rating: Number(formData.rating) || 0,
      contacts,
      // Keep legacy single-contact columns in step with the primary contact.
      contact_person: primary?.name || undefined,
      phone: primary?.phone || undefined,
      email: primary?.email || undefined,
      contact_designation: primary?.designation || undefined,
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
            placeholder="Auto-generated if left blank"
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

      {/* ---------- Contact persons ---------- */}
      <div className={styles.contactSectionHead}>
        <div>
          <h3>Contact Persons</h3>
          <p className={styles.hint}>
            Add every person the vendor wants us to reach. Exactly one must be
            marked primary; only the primary is used on work orders and reports.
          </p>
        </div>
        <button type="button" className={styles.addBtn} onClick={addContact}>
          <FiPlus /> Add contact
        </button>
      </div>

      {formData.contacts.map((contact, index) => (
        <div key={index} className={styles.contactCard}>
          <div className={styles.contactHead}>
            <span className={styles.contactIndex}>Contact {index + 1}</span>
            <div className={styles.contactActions}>
              <button
                type="button"
                className={`${styles.primaryBtn} ${contact.is_primary ? styles.primaryOn : ""}`}
                onClick={() => setPrimary(index)}
                title="Use this contact as the primary contact"
              >
                <FiStar /> {contact.is_primary ? "Primary" : "Make primary"}
              </button>
              <button
                type="button"
                className={styles.removeBtn}
                onClick={() => removeContact(index)}
                disabled={formData.contacts.length === 1}
                title="Remove contact"
              >
                <FiTrash2 />
              </button>
            </div>
          </div>

          <div className={styles.contactGrid}>
            <div className={styles.field}>
              <label>Name *</label>
              <input
                type="text"
                value={contact.name}
                onChange={(e) => setContact(index, "name", e.target.value)}
                placeholder="e.g. Ramesh Iyer"
              />
            </div>
            <div className={styles.field}>
              <label>Designation</label>
              <input
                type="text"
                value={contact.designation}
                onChange={(e) => setContact(index, "designation", e.target.value)}
                placeholder="e.g. Site Manager"
              />
            </div>
            <div className={styles.field}>
              <label>Phone</label>
              <input
                type="text"
                value={contact.phone}
                onChange={(e) => setContact(index, "phone", e.target.value)}
                placeholder="+91 90000 00000"
              />
            </div>
            <div className={styles.field}>
              <label>Email</label>
              <input
                type="email"
                value={contact.email}
                onChange={(e) => setContact(index, "email", e.target.value)}
                placeholder="name@company.com"
              />
            </div>
          </div>
        </div>
      ))}

      <div className={styles.row}>
        <div className={styles.field}>
          <label>Address</label>
          <input
            type="text"
            name="address"
            value={formData.address}
            onChange={handleChange}
          />
        </div>

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

      {error && <div className={styles.errorMsg}>{error}</div>}

      <div className={styles.actions}>
        <button type="submit" className={styles.submitBtn}>
          {initialData ? "Update Vendor" : "Add Vendor"}
        </button>
      </div>
    </form>
  );
};

export default NewVendorForm;
