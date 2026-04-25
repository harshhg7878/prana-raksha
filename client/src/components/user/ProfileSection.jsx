import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";

const defaultProfile = {
  name: "",
  email: "",
  role: "",
  phone: "",
  primaryHospital: "",
  locationSharing: true,
  alertMethod: "SMS + Push",
  profileStatus: "Active",
};

export default function ProfileSection({ profile, setProfile, setActiveSection }) {
  const [formState, setFormState] = useState(profile || defaultProfile);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setFormState(profile || defaultProfile);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [profile]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormState((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    setMessage("");

    try {
      setSaving(true);

      const res = await apiFetch("/api/auth/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formState.name,
          phone: formState.phone,
          primaryHospital: formState.primaryHospital,
          locationSharing: formState.locationSharing,
          alertMethod: formState.alertMethod,
          profileStatus: formState.profileStatus,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to update profile");
      }

      setProfile(data.user || defaultProfile);
      localStorage.setItem("user", JSON.stringify(data.user || defaultProfile));
      setMessage("Profile updated successfully.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="section-stack">
      <div className="panel glass-card section-page">
        <div className="section-head-row">
          <div>
            <p className="eyebrow">User account</p>
            <h2>Profile</h2>
          </div>
          <button className="secondary-btn" onClick={() => setActiveSection("dashboard")}>
            Back to Dashboard
          </button>
        </div>

        {message && <div className="profile-message">{message}</div>}

        <form className="profile-grid profile-form-grid" onSubmit={saveProfile}>
          <div className="profile-info-card">
            <h3>Personal Information</h3>

            <div className="input-group">
              <label>Name</label>
              <input name="name" value={formState.name} onChange={handleChange} />
            </div>

            <div className="input-group">
              <label>Email</label>
              <input value={formState.email} readOnly />
            </div>

            <div className="input-group">
              <label>Phone</label>
              <input
                name="phone"
                value={formState.phone}
                onChange={handleChange}
                placeholder="Enter phone number"
              />
            </div>

            <div className="input-group">
              <label>Role</label>
              <input value={formState.role} readOnly />
            </div>
          </div>

          <div className="profile-info-card">
            <h3>Emergency Preferences</h3>

            <div className="input-group">
              <label>Primary Hospital</label>
              <input
                name="primaryHospital"
                value={formState.primaryHospital}
                onChange={handleChange}
                placeholder="Enter preferred hospital"
              />
            </div>

            <div className="input-group">
              <label>Alert Method</label>
              <select
                name="alertMethod"
                value={formState.alertMethod}
                onChange={handleChange}
                className="contact-select"
              >
                <option value="SMS">SMS</option>
                <option value="Push">Push</option>
                <option value="SMS + Push">SMS + Push</option>
              </select>
            </div>

            <div className="input-group">
              <label>Status</label>
              <select
                name="profileStatus"
                value={formState.profileStatus}
                onChange={handleChange}
                className="contact-select"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>

            <label className="contact-check profile-toggle">
              <input
                type="checkbox"
                name="locationSharing"
                checked={formState.locationSharing}
                onChange={handleChange}
              />
              <span>Enable live location sharing</span>
            </label>

            <button className="primary-btn full-btn" type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Profile"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
