import { BrowserRouter, Routes, Route } from "react-router-dom";

import Home from "./pages/Home";
import Login from "./pages/Login";
import UserDashboard from "./pages/UserDashboard"; // ✅ updated
import Admin from "./pages/Admin";
import Hospital from "./pages/Hospital";

import ProtectedRoute from "./components/ProtectedRoute";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* Public */}
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />

        {/* User Dashboard */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute allowedRoles={["user"]}>
              <UserDashboard />   {/* ✅ changed */}
            </ProtectedRoute>
          }
        />

        {/* Admin */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <Admin />
            </ProtectedRoute>
          }
        />

        {/* Hospital */}
        <Route
          path="/hospital"
          element={
            <ProtectedRoute allowedRoles={["hospital"]}>
              <Hospital />
            </ProtectedRoute>
          }
        />

      </Routes>
    </BrowserRouter>
  );
}