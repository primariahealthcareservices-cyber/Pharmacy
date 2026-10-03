import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button, Input, Field } from "../components/ui";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@pharmacy.com");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

  // Hide splash after the animation completes (~2.8s total)
  useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), 2800);
    return () => clearTimeout(t);
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.message || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  // ── Splash overlay ──
  if (showSplash) {
    return (
      <div className="splash">
        <img src="/primaria.png" alt="Primaria Health Care" className="splash-logo" />
      </div>
    );
  }

  // ── Login page ──
  return (
    <div className="min-h-screen flex items-center justify-center login-bg p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 border border-blue-100">
        <div className="text-center mb-6">
          <img
            src="/primaria.png"
            alt="Primaria Health Care"
            className="mx-auto mb-4 h-20 object-contain"
          />
          <h1 className="text-2xl font-bold text-blue-900">Primaria Pharmacy</h1>
          <p className="text-sm text-slate-500 mt-1">Sign in to your account</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>

          <Field label="Password">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button
            type="submit"
            disabled={busy}
            className="w-full !bg-blue-600 hover:!bg-blue-700"
          >
            {busy ? "Signing in..." : "Sign In"}
          </Button>
        </form>

        <p className="text-xs text-center text-slate-400 mt-5">
          Demo: admin@pharmacy.com / admin123
        </p>
      </div>
    </div>
  );
}