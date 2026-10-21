"use client";

import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/firebase";
import AuthGuard from "@/components/AuthGuard";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(""); setLoading(true);
    try { await signInWithEmailAndPassword(auth, email, password); }
    catch { setError("Não foi possível entrar. Verifique e-mail e senha."); }
    finally { setLoading(false); }
  }

  return (
    <AuthGuard>
      <main className="login-page center-container">
        <div className="login-box login-card">
          <h1 className="login-title">SIG-NPCA</h1>
          <p className="login-text" style={{textAlign:"center"}}>Sistema Integrado de Gestão</p>
          <form className="login-form" onSubmit={submit}>
            <div className="input-group"><label>Email</label><input type="email" className="login-input" value={email} onChange={(e)=>setEmail(e.target.value)} required /></div>
            <div className="input-group"><label>Senha</label><input type="password" className="login-input" value={password} onChange={(e)=>setPassword(e.target.value)} required /></div>
            {error && <p style={{color:"var(--primary)"}}>{error}</p>}
            <button className="login-submit-btn" disabled={loading}>{loading ? "Entrando..." : "Entrar"}</button>
          </form>
        </div>
      </main>
    </AuthGuard>
  );
}
