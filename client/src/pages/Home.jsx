import { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import "../styles/home.css";

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const revealOnScroll = () => {
      const revealItems = document.querySelectorAll(".reveal");

      revealItems.forEach((item) => {
        const windowHeight = window.innerHeight;
        const itemTop = item.getBoundingClientRect().top;
        const revealPoint = 100;

        if (itemTop < windowHeight - revealPoint) {
          item.classList.add("active");
        }
      });
    };

    revealOnScroll();
    window.addEventListener("scroll", revealOnScroll);
    window.addEventListener("load", revealOnScroll);

    return () => {
      window.removeEventListener("scroll", revealOnScroll);
      window.removeEventListener("load", revealOnScroll);
    };
  }, []);

  return (
    <>
      <Navbar menuOpen={menuOpen} setMenuOpen={setMenuOpen} />

      <section className="hero" id="home">
        <div className="hero-bg"></div>
        <div className="hero-grid container">
          <div className="hero-left reveal">
            <span className="hero-badge">
              AI Accident Detection & Emergency Response
            </span>
            <h1>
              Smarter emergency alerts with
              <span> AI-powered incident detection</span>
            </h1>
            <p>
              Prana Raksha helps detect possible incidents from images and live
              dashcam feeds, captures location data, and supports faster
              emergency alert coordination for hospitals and response teams.
            </p>

            <div className="hero-actions">
              <a href="/login" className="primary-btn">
                Get Started
              </a>
              <a href="#how" className="secondary-btn">
                See How It Works
              </a>
            </div>

            <div className="hero-stats">
              <div className="stat-box">
                <h3>24/7</h3>
                <p>Incident Monitoring</p>
              </div>
              <div className="stat-box">
                <h3>AI</h3>
                <p>Detection Engine</p>
              </div>
              <div className="stat-box">
                <h3>Live</h3>
                <p>Emergency Alerts</p>
              </div>
            </div>
          </div>

          <div className="hero-right reveal">
            <div className="dashboard-card floating-card">
              <div className="card-top">
                <span className="live-pill"></span>
                <p>Live Incident Alert</p>
              </div>

              <div className="incident-preview">
                <div className="preview-screen">
                  <div className="scan-line"></div>
                  <div className="alert-tag">Collision Detected</div>
                </div>
              </div>

              <div className="incident-meta">
                <div className="meta-item">
                  <span>Confidence</span>
                  <strong>92%</strong>
                </div>
                <div className="meta-item">
                  <span>Location</span>
                  <strong>Lucknow</strong>
                </div>
                <div className="meta-item">
                  <span>Status</span>
                  <strong>Alert Sent</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="features-section" id="features">
        <div className="container">
          <div className="section-head reveal">
            <span>Core Features</span>
            <h2>
              Designed for fast response and intelligent emergency handling
            </h2>
            <p>
              A modern platform that combines AI detection, live monitoring,
              and emergency communication in one unified system.
            </p>
          </div>

          <div className="features-grid">
            <div className="feature-card reveal">
              <div className="feature-icon">📷</div>
              <h3>Image-Based Detection</h3>
              <p>
                Analyze uploaded images to detect possible accident scenes and
                emergency situations.
              </p>
            </div>

            <div className="feature-card reveal">
              <div className="feature-icon">🎥</div>
              <h3>Live Dashcam Monitoring</h3>
              <p>
                Monitor live camera or dashcam frames to identify incidents in
                real time.
              </p>
            </div>

            <div className="feature-card reveal">
              <div className="feature-icon">📍</div>
              <h3>Location Tracking</h3>
              <p>
                Attach GPS location to incident data for faster emergency
                dispatch and response.
              </p>
            </div>

            <div className="feature-card reveal">
              <div className="feature-icon">🚑</div>
              <h3>Hospital Alert System</h3>
              <p>
                Notify nearby hospitals or operators instantly when an
                emergency is detected.
              </p>
            </div>

            <div className="feature-card reveal">
              <div className="feature-icon">📊</div>
              <h3>Smart Dashboard</h3>
              <p>
                View live incidents, confidence scores, response status, and
                system activity in one place.
              </p>
            </div>

            <div className="feature-card reveal">
              <div className="feature-icon">🛡️</div>
              <h3>Secure Access</h3>
              <p>
                Role-based login for users, hospitals, and emergency response
                administrators.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="how-section" id="how">
        <div className="container">
          <div className="section-head reveal">
            <span>How It Works</span>
            <h2>From incident detection to emergency action</h2>
          </div>

          <div className="steps-grid">
            <div className="step-card reveal">
              <div className="step-number">01</div>
              <h3>Capture Input</h3>
              <p>
                Upload an image or use a live dashcam/video feed to provide
                visual incident data.
              </p>
            </div>

            <div className="step-card reveal">
              <div className="step-number">02</div>
              <h3>AI Analysis</h3>
              <p>
                The AI engine checks the frame for collision, damage, smoke, or
                other emergency indicators.
              </p>
            </div>

            <div className="step-card reveal">
              <div className="step-number">03</div>
              <h3>Location Mapping</h3>
              <p>
                The system attaches location information so responders know
                where the incident happened.
              </p>
            </div>

            <div className="step-card reveal">
              <div className="step-number">04</div>
              <h3>Emergency Alert</h3>
              <p>
                Hospitals and dashboard operators receive alerts and can take
                action immediately.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="about-section" id="about">
        <div className="container about-grid">
          <div className="about-left reveal">
            <span className="about-tag">About Prana Raksha</span>
            <h2>Built to support faster, smarter emergency response.</h2>
            <p>
              Prana Raksha is an AI-powered emergency system concept designed
              to improve how incidents are detected and communicated. By
              combining computer vision, live monitoring, and emergency
              coordination, the platform aims to reduce delay in critical
              situations.
            </p>
            <a href="/login" className="primary-btn">
              Access Platform
            </a>
          </div>

          <div className="about-right reveal">
            <div className="about-box">
              <h3>Mission</h3>
              <p>
                To connect AI detection with real emergency workflows in a
                simple, modern, and effective way.
              </p>
            </div>
            <div className="about-box">
              <h3>Vision</h3>
              <p>
                To support a future where emergency incidents are identified
                faster and response teams receive actionable alerts instantly.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="cta-section">
        <div className="container cta-box reveal">
          <h2>Ready to explore the Prana Raksha platform?</h2>
          <p>
            Login to access the system and continue building your emergency
            response workflow.
          </p>
          <a href="/login" className="primary-btn">
            Go to Login
          </a>
        </div>
      </section>

      <footer className="footer">
        <div className="container footer-inner">
          <div>
            <img
              src="/logo.png"
              alt="Prana Raksha Logo"
              className="footer-logo"
            />
          </div>
          <p>
            &copy; 2026 Prana Raksha. AI Accident Detection & Emergency Alert
            System.
          </p>
        </div>
      </footer>
    </>
  );
}
