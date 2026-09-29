import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Medicines from "./pages/Medicines";
import Manufacturers from "./pages/Manufacturers";
import Vendors from "./pages/Vendors";
import Customers from "./pages/Customers";
import Purchases from "./pages/Purchases";
import NewPurchase from "./pages/NewPurchase";
import Inventory from "./pages/Inventory";
import POS from "./pages/POS";
import Sales from "./pages/Sales";
import Expenses from "./pages/Expenses";
import Payments from "./pages/Payments";
import Reports from "./pages/Reports";
import Users from "./pages/Users";

function Protected({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/medicines" element={<Medicines />} />
        <Route path="/manufacturers" element={<Manufacturers />} />
        <Route path="/vendors" element={<Vendors />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/purchases" element={<Purchases />} />
        <Route path="/purchases/new" element={<NewPurchase />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/pos" element={<POS />} />
        <Route path="/sales" element={<Sales />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/users" element={<Users />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}