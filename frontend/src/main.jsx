import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App.jsx';
import FieldPortal from './pages/FieldPortal.jsx';
import VolunteerPortal from './pages/VolunteerPortal.jsx';
import PortalNav from './components/PortalNav.jsx';
import ToastContainer from './components/Toast.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import './styles.css';

function Layout({ children }) {
  return (
    <ThemeProvider>
      <div className="portal-root">
        <PortalNav />
        <div className="portal-main">
          {children}
          <ToastContainer />
        </div>
      </div>
    </ThemeProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Coordinator dashboard gets the full App shell (its own topbar etc.) */}
        <Route
          path="/"
          element={
            <Layout>
              <App />
            </Layout>
          }
        />
        <Route
          path="/report"
          element={
            <Layout>
              <FieldPortal />
            </Layout>
          }
        />
        <Route
          path="/volunteer"
          element={
            <Layout>
              <VolunteerPortal />
            </Layout>
          }
        />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
