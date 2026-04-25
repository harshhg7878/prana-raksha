import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, setSessionToken } from "../lib/api";
import "../styles/login.css";

export default function Login() {
  const navigate = useNavigate();
  const loginCardRef = useRef(null);

  const [showSplash, setShowSplash] = useState(true);
  const [showPage, setShowPage] = useState(false);
  const [mode, setMode] = useState("login"); // login or register
  const [role, setRole] = useState("user");
  const [showPassword, setShowPassword] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    primaryHospital: "",
    email: "",
    password: "",
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
      setShowPage(true);
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!showPage || typeof window === "undefined") {
      return undefined;
    }

    if (!window.matchMedia("(max-width: 640px)").matches) {
      return undefined;
    }

    let frameId = null;
    const timer = window.setTimeout(() => {
      const element = loginCardRef.current;

      if (!element) {
        return;
      }

      const startY = window.scrollY;
      const targetY = Math.max(
        element.getBoundingClientRect().top + window.scrollY - 16,
        0
      );
      const distance = targetY - startY;
      const duration = 700;
      const startTime = performance.now();

      const easeInOutCubic = (progress) =>
        progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      const animateScroll = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = easeInOutCubic(progress);

        window.scrollTo(0, startY + distance * easedProgress);

        if (progress < 1) {
          frameId = window.requestAnimationFrame(animateScroll);
        }
      };

      frameId = window.requestAnimationFrame(animateScroll);
    }, 220);

    return () => {
      window.clearTimeout(timer);
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [showPage]);

  const handleChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const readResponsePayload = async (res, fallbackMessage) => {
    const contentType = res.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const data = await res.json();
      return {
        data,
        message: data?.message || fallbackMessage,
      };
    }

    const text = await res.text();
    return {
      data: null,
      message: text && text.trim().startsWith("<")
        ? fallbackMessage
        : text || fallbackMessage,
    };
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          role: role,
        }),
      });
      const { data, message: responseMessage } = await readResponsePayload(
        res,
        "Login failed"
      );

      if (!res.ok) {
        throw new Error(responseMessage);
      }

      localStorage.setItem("user", JSON.stringify(data.user));
      setSessionToken(data.token || "");

      const userRole = data.user.role;

      if (userRole === "admin") {
        navigate("/admin", { replace: true });
      } else if (userRole === "hospital") {
        navigate("/hospital", { replace: true });
      } else {
        navigate("/dashboard", { replace: true });
      }
    } catch (error) {
      setMessage(error.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const res = await apiFetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.name,
          primaryHospital: role === "hospital" ? formData.primaryHospital : "",
          email: formData.email,
          password: formData.password,
          role: role,
        }),
      });
      const { data, message: responseMessage } = await readResponsePayload(
        res,
        "Registration failed"
      );

      if (!res.ok) {
        throw new Error(responseMessage);
      }

      setMessage(data.message || "Registration successful");

      setFormData({
        name: "",
        primaryHospital: "",
        email: "",
        password: "",
      });

      setMode("login");
    } catch (error) {
      setMessage(error.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {showSplash && (
        <section className="splash-screen">
          <div className="splash-glow glow-1"></div>
          <div className="splash-glow glow-2"></div>

          <div className="splash-content">
            <div className="logo-reveal-wrap">
              <img src="/logo.png" alt="Prana Raksha Logo" className="animated-logo" />
            </div>

            <div className="loading-line">
              <span></span>
            </div>

            <p className="splash-tagline">Smart emergency access begins here</p>
          </div>
        </section>
      )}

      <main className={`auth-page ${showPage ? "show" : "hidden"}`}>
        <div className="bg-shape bg-shape-1"></div>
        <div className="bg-shape bg-shape-2"></div>
        <div className="bg-grid"></div>

        <div className="auth-container">
          <div className="auth-left">
            <div className="brand-block">
              <img src="/logo.png" alt="Prana Raksha Logo" className="brand-logo" />
            </div>

            <span className="badge">AI Powered Emergency Platform</span>

            <h1>
              Secure access for real-time incident monitoring and emergency response.
            </h1>

            <p>
              Login to access the Prana Raksha system, where AI-based accident
              detection, emergency alerting, and hospital coordination work together
              in one powerful platform.
            </p>

            <div className="feature-points">
              <div className="point-card">
                <span className="point-icon">⚡</span>
                <div>
                  <h3>Instant Access</h3>
                  <p>Fast and secure login for emergency workflow control.</p>
                </div>
              </div>

              <div className="point-card">
                <span className="point-icon">📍</span>
                <div>
                  <h3>Live Monitoring</h3>
                  <p>Track incident alerts, location, and response status.</p>
                </div>
              </div>

              <div className="point-card">
                <span className="point-icon">🛡</span>
                <div>
                  <h3>Protected Dashboard</h3>
                  <p>Controlled access for users, hospitals, and administrators.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="auth-right">
            <div className="login-card" ref={loginCardRef}>
              <div className="login-top">
                <span className="mini-badge">
                  {mode === "login" ? "Welcome Back" : "Create Account"}
                </span>
                <h2>{mode === "login" ? "Login to continue" : "Register to continue"}</h2>
                <p>
                  {mode === "login"
                    ? "Enter your details to access the Prana Raksha dashboard."
                    : "Fill in your details to create your Prana Raksha account."}
                </p>
              </div>

              <div className="role-switch role-switch-3">
                <button
                  className={`role-btn ${role === "user" ? "active" : ""}`}
                  type="button"
                  onClick={() => setRole("user")}
                >
                  User
                </button>

                <button
                  className={`role-btn ${role === "hospital" ? "active" : ""}`}
                  type="button"
                  onClick={() => setRole("hospital")}
                >
                  Hospital
                </button>

                <button
                  className={`role-btn ${role === "admin" ? "active" : ""}`}
                  type="button"
                  onClick={() => {
                    setRole("admin");
                    setMessage("");
                  }}
                >
                  Admin
                </button>
              </div>

              <form
                className="login-form"
                onSubmit={mode === "login" ? handleLogin : handleRegister}
              >
                {mode === "register" && (
                  <div className="input-group">
                    <label htmlFor="name">Full Name</label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      placeholder="Enter your full name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                    />
                  </div>
                )}

                {mode === "register" && role === "hospital" && (
                  <div className="input-group">
                    <label htmlFor="primaryHospital">Hospital Name</label>
                    <input
                      type="text"
                      id="primaryHospital"
                      name="primaryHospital"
                      placeholder="Enter hospital name"
                      value={formData.primaryHospital}
                      onChange={handleChange}
                      required
                    />
                  </div>
                )}

                <div className="input-group">
                  <label htmlFor="email">Email Address</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    placeholder="Enter your email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="input-group">
                  <label htmlFor="password">Password</label>
                  <div className="password-wrap">
                    <input
                      type={showPassword ? "text" : "password"}
                      id="password"
                      name="password"
                      placeholder="Enter your password"
                      value={formData.password}
                      onChange={handleChange}
                      required
                    />
                    <button
                      type="button"
                      className="toggle-password"
                      onClick={() => setShowPassword((prev) => !prev)}
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>

                {mode === "login" && (
                  <div className="form-row">
                    <label className="remember-wrap">
                      <input type="checkbox" />
                      <span>Remember me</span>
                    </label>

                    <a href="#" className="forgot-link">Forgot password?</a>
                  </div>
                )}

                <button type="submit" className="login-btn" disabled={loading}>
                  {loading
                    ? mode === "login"
                      ? "Logging in..."
                      : "Registering..."
                    : mode === "login"
                    ? "Login Securely"
                    : "Create Account"}
                </button>

                {message && (
                  <p style={{ marginTop: "10px", color: "#d24c3f", fontWeight: 600 }}>
                    {message}
                  </p>
                )}
              </form>

              <div className="bottom-text">
                {mode === "login" ? (
                  <>
                    Don’t have an account?
                    <button
                      type="button"
                      className="auth-switch-btn"
                      onClick={() => {
                        setMode("register");
                        setMessage("");
                      }}
                    >
                      Register
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?
                    <button
                      type="button"
                      className="auth-switch-btn"
                      onClick={() => {
                        setMode("login");
                        setMessage("");
                      }}
                    >
                      Login
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
