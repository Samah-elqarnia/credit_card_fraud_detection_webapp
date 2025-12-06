import React, { useState, useEffect, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import "./App.css";

export default function App() {
  const [form, setForm] = useState({
    type: "PAYMENT",
    amount: "",
    oldbalanceOrg: "",
    newbalanceOrig: "",
    oldbalanceDest: "",
    newbalanceDest: "",
    threshold: 0.5,
  });

  const [result, setResult] = useState(null);
  const [csvResults, setCsvResults] = useState(null);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [chartData, setChartData] = useState([]);

  const API = process.env.REACT_APP_API || "http://127.0.0.1:8000";

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${API}/history`);
      const json = await res.json();
      setHistory(Array.isArray(json) ? json : []);
    } catch (e) {
      console.error("fetchHistory error", e);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API}/stats`);
      const json = await res.json();
      setStats(json);
    } catch (e) {
      console.error("fetchStats error", e);
    }
  };

  useEffect(() => {
    fetchHistory();
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // derive small chart data from history (group by date)
    const buckets = {};
    history.forEach((h) => {
      const d = new Date(h.timestamp || Date.now());
      const key = d.toLocaleDateString();
      if (!buckets[key]) buckets[key] = { date: key, total: 0, fraud: 0 };
      buckets[key].total += 1;
      if (Number(h.prediction) === 1) buckets[key].fraud += 1;
    });
    const arr = Object.values(buckets).sort((a, b) => new Date(a.date) - new Date(b.date));
    setChartData(arr);
  }, [history]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((s) => ({ ...s, [name]: value }));
  };

  const handlePredict = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          amount: parseFloat(form.amount) || 0,
          oldbalanceOrg: parseFloat(form.oldbalanceOrg) || 0,
          newbalanceOrig: parseFloat(form.newbalanceOrig) || 0,
          oldbalanceDest: parseFloat(form.oldbalanceDest) || 0,
          newbalanceDest: parseFloat(form.newbalanceDest) || 0,
          threshold: parseFloat(form.threshold) || 0.5,
        }),
      });
      const data = await res.json();
      setResult(data);

      // add to local UI history (timestamp) — server also stores history
      setHistory((h) => [
        ...(Array.isArray(h) ? h : []),
        { ...data, timestamp: new Date().toISOString() },
      ]);

      await fetchStats();
    } catch (e) {
      console.error("handlePredict error", e);
      alert("Prediction failed — check backend or network.");
    } finally {
      setLoading(false);
    }
  };

  const handleCSV = async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("threshold", form.threshold);
      const res = await fetch(`${API}/predict_csv`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      setCsvResults(data);
      // append csv rows to local history for UI
      if (Array.isArray(data)) {
        const rows = data.map((r) => ({ ...r, timestamp: new Date().toISOString() }));
        setHistory((h) => [...(Array.isArray(h) ? h : []), ...rows]);
      }
      await fetchStats();
    } catch (e) {
      console.error("handleCSV error", e);
      alert("CSV upload failed — check file format and backend.");
    } finally {
      setLoading(false);
    }
  };

  const clearHistory = () => {
    setHistory([]);
  };
  const statCards = useMemo(
    () => [
      { id: "total", label: "Total", value: stats?.total ?? 0, color: "#fff" },
      { id: "frauds", label: "Frauds", value: stats?.frauds ?? 0, color: "#ff6b6b" },
      {
        id: "rate",
        label: "Fraud Rate",
        value: stats ? `${(stats.fraud_rate * 100).toFixed(4)}%` : "0%",
        color: "#3df26f",
      },
    ],
    [stats]
  );

  return (
    <div className="fd-app container">
      <header className="fd-header">
        <div className="brand">
          <div className="brand-text">
            <h1>Credit Card Fraud Detection</h1>
            <div className="subtitle">Realtime dashboard</div>
          </div>
        </div>

        <div className="header-actions">
          <label className="btn-ghost" title="Upload notebook (optional)">
            <input type="file" accept=".ipynb,.csv" style={{ display: "none" }} />
            Upload
          </label>
          <button className="btn-ghost" onClick={clearHistory}>
            Clear
          </button>
        </div>
      </header>

      <main className="grid">
        <section className="left">
          <div className="card form-card">
            <h2>Predict a Transaction</h2>

            <div className="form-grid">
              <div className="input-group">
                
                <label>Type</label>
                <select name="type" value={form.type} onChange={handleChange} className="input">
                  <option>PAYMENT</option>
                  <option>CASH_IN</option>
                  <option>CASH_OUT</option>
                  <option>DEBIT</option>
                  <option>TRANSFER</option>
                </select>
              </div>

              <div className="input-group">
                <label>Amount</label>
                <input name="amount" value={form.amount} onChange={handleChange} className="input" />
              </div>

              <div className="input-group">
                <label>oldbalanceOrg</label>
                <input name="oldbalanceOrg" value={form.oldbalanceOrg} onChange={handleChange} className="input" />
              </div>

              <div className="input-group">
                <label>newbalanceOrig</label>
                <input name="newbalanceOrig" value={form.newbalanceOrig} onChange={handleChange} className="input" />
              </div>

              <div className="input-group">
                <label>oldbalanceDest</label>
                <input name="oldbalanceDest" value={form.oldbalanceDest} onChange={handleChange} className="input" />
              </div>

              <div className="input-group">
                <label>newbalanceDest</label>
                <input name="newbalanceDest" value={form.newbalanceDest} onChange={handleChange} className="input" />
              </div>

              <div className="input-group range-group">
                <label>Threshold: {form.threshold}</label>
                <input type="range" name="threshold" min="0.01" max="0.99" step="0.01" value={form.threshold} onChange={handleChange} />
              </div>
            </div>

            <div className="actions">
              <button className="btn-primary" onClick={handlePredict} disabled={loading}>
                {loading ? "Predicting..." : "Predict"}
              </button>

              <label className="btn-upload">
                <input type="file" accept=".csv" onChange={handleCSV} style={{ display: "none" }} />
                Upload CSV
              </label>
            </div>

            {result && (
              <div className={`result-card ${result.label === "Fraud" ? "fraud" : "normal"}`}>
                <div className="result-left">
                  <div className="label">Prediction</div>
                  <div className={`value ${result.label === "Fraud" ? "val-fraud" : "val-normal"}`}>{result.label}</div>
                  <div className="meta">Prob: {result.probability.toFixed(4)}</div>
                </div>
                <div className="result-right">{/* small live badge */}</div>
              </div>
            )}
          </div>

          <div className="card csv-card">
            <h3>CSV Results</h3>
            {csvResults ? (
              <div className="table-wrap">
                <table className="csv-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Prob</th>
                      <th>Label</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvResults.map((r, idx) => (
                      <tr key={idx}>
                        <td>{idx + 1}</td>
                        <td>{r.probability.toFixed(4)}</td>
                        <td className={r.prediction === 1 ? "tag-fraud" : "tag-safe"}>{r.prediction === 1 ? "Fraud" : "Normal"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="muted">No CSV uploaded yet.</div>
            )}
          </div>
        </section>

        <aside className="right">
          <div className="card stats-card">
            <h3>Statistics</h3>
            <div className="stats-grid">
              {statCards.map((s) => (
                <div key={s.id} className="stat">
                  <div className="stat-label">{s.label}</div>
                  <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card history-card">
            <div className="history-head">
              <h3>History</h3>
              <div className="small muted">Last {history.length}</div>
            </div>
            <ul className="history-list">
              {history.slice().reverse().slice(0, 12).map((h, i) => (
                <li key={i} className="history-item">
                  <div>
                    <div className="history-label">{h.label}</div>
                    <div className="history-time muted">{new Date(h.timestamp || Date.now()).toLocaleString()}</div>
                  </div>
                  <div className={`history-prob ${h.prediction === 1 ? "hp-fraud" : "hp-normal"}`}>{(h.probability).toFixed(3)}</div>
                </li>
              ))}
            </ul>
          </div>

          <div className="card chart-card">
            <h3>Fraud over time</h3>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#111" />
                  <XAxis dataKey="date" tick={{ fill: "#888" }} />
                  <YAxis tick={{ fill: "#888" }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="total" stroke="#8884d8" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="fraud" stroke="#ff4d4d" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </aside>
      </main>

      <footer className="footer">Connected to: <code>{API}</code></footer>
    </div>
  );
}
