"use client";

import { formatTime, localDay } from "@/attendance";
import AuthGuard from "@/components/AuthGuard";
import Navbar from "@/components/Navbar";
import { auth } from "@/firebase";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { onAuthStateChanged } from "firebase/auth";
import { useCallback, useEffect, useState } from "react";

const emptyReport = { content: "", activities: "", notes: "" };
const dayLabel = (date) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

export default function AttendancePage() {
  const [user, setUser] = useState(null);
  const [month, setMonth] = useState(() => localDay().slice(0, 7));
  const [selected, setSelected] = useState(() => localDay());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(null);
  const [report, setReport] = useState(emptyReport);

  useEffect(
    () =>
      onAuthStateChanged(auth, (current) => {
        setUser(current);
        setData(null);
      }),
    [],
  );
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/ponto?month=${month}`, {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setData(result);
      setError("");
    } catch (err) {
      setData(null);
      setError(err.message || "Não foi possível carregar o ponto.");
    } finally {
      setLoading(false);
    }
  }, [user, month]);
  useEffect(() => {
    load();
  }, [load]);

  function edit(record) {
    setEditing(record);
    setReport({
      content: record.content,
      activities: record.activities,
      notes: record.notes,
    });
    setNotice("");
  }
  async function save(action) {
    if (!user || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/ponto", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await user.getIdToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action, id: editing?.id, ...report }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setEditing(null);
      setReport(emptyReport);
      setNotice(
        action === "start"
          ? "Entrada registrada com o horário atual."
          : action === "finish"
            ? "Saída e atividades registradas."
            : "Relatório salvo.",
      );
      await load();
    } catch (err) {
      setError(err.message || "Não foi possível salvar o registro.");
    } finally {
      setBusy(false);
    }
  }
  function changeMonth(offset) {
    const [year, number] = month.split("-").map(Number);
    const date = new Date(year, number - 1 + offset, 1, 12);
    const next = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    setMonth(next);
    setSelected(`${next}-01`);
    setEditing(null);
  }
  const [year, number] = month.split("-").map(Number);
  const days = new Date(year, number, 0).getDate();
  const offset = new Date(year, number - 1, 1).getDay();
  const records = data?.records || [];
  const daily = records.filter((r) => r.date === selected);
  const minutes = records.reduce(
    (sum, r) =>
      sum +
      (r.endedAt
        ? Math.max(0, (new Date(r.endedAt) - new Date(r.startedAt)) / 60000)
        : 0),
    0,
  );
  const active = data?.active;

  return (
    <AuthGuard>
      <Navbar />
      <main className="attendance-page">
        <div className="attendance-container">
          <header className="attendance-header">
            <small>DIRETORIA DE ORIENTAÇÃO</small>
            <h1>Ponto e atividades</h1>
            <p>
              Registre sua presença e mantenha um histórico do conteúdo e das
              atividades realizadas.
            </p>
          </header>
          {error && (
            <div className="documents-error" role="alert">
              {error}{" "}
              <button type="button" disabled={busy || loading} onClick={load}>
                Tentar novamente
              </button>
            </div>
          )}
          {notice && (
            <p className="attendance-notice" role="status">
              {notice}
            </p>
          )}
          {loading && <p role="status">Carregando registros...</p>}
          {data && (
            <>
              <section className="attendance-status">
                <div>
                  <small>{data.member.role}</small>
                  <h2>{data.member.name}</h2>
                  <p>
                    {active
                      ? `Entrada em ${dayLabel(active.date)} às ${formatTime(active.startedAt)}`
                      : "Nenhum ponto em andamento"}
                  </p>
                  <small>
                    Horários de Brasília · entrada e saída registradas pelo
                    servidor
                  </small>
                </div>
                {active ? (
                  <button
                    disabled={busy || loading}
                    onClick={() => {
                      edit(active);
                      setSelected(active.date);
                      setMonth(active.date.slice(0, 7));
                    }}
                  >
                    Registrar saída / atividades
                  </button>
                ) : (
                  <button
                    disabled={busy || loading}
                    onClick={() => save("start")}
                  >
                    Bater ponto · entrada
                  </button>
                )}
              </section>
              <div className="attendance-layout">
                <section
                  className="attendance-panel"
                  aria-label="Calendário de registros"
                >
                  <div className="attendance-month">
                    <button
                      aria-label="Mês anterior"
                      disabled={busy}
                      onClick={() => changeMonth(-1)}
                    >
                      <CaretLeftIcon />
                    </button>
                    <p>
                      {new Date(year, number - 1, 1).toLocaleDateString(
                        "pt-BR",
                        { month: "long", year: "numeric" },
                      ).toUpperCase()}
                    </p>
                    <button
                      aria-label="Próximo mês"
                      disabled={busy}
                      onClick={() => changeMonth(1)}
                    >
                      <CaretRightIcon />
                    </button>
                  </div>
                  <div className="attendance-calendar">
                    {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(
                      (day) => (
                        <span className="attendance-weekday" key={day}>
                          {day}
                        </span>
                      ),
                    )}
                    {Array.from({ length: offset }, (_, i) => (
                      <span key={`empty-${i}`} />
                    ))}
                    {Array.from({ length: days }, (_, i) => {
                      const date = `${month}-${String(i + 1).padStart(2, "0")}`;
                      const count = records.filter(
                        (r) => r.date === date,
                      ).length;
                      return (
                        <button
                          key={date}
                          className={`${date === selected ? "selected" : ""} ${date === localDay() ? "today" : ""}`}
                          aria-pressed={selected === date}
                          aria-label={`${dayLabel(date)}, ${count} registros`}
                          onClick={() => {
                            setSelected(date);
                            setEditing(null);
                          }}
                          disabled={busy}
                        >
                          <span>{i + 1}</span>
                          {count > 0 && (
                            <small>
                              {count} ponto{count > 1 ? "s" : ""}
                            </small>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <p className="attendance-summary">
                    {records.length} registros · {Math.floor(minutes / 60)}h{" "}
                    {Math.floor(minutes % 60)}min concluídos no mês
                  </p>
                </section>
                <section className="attendance-panel">
                  <small>DIÁRIO DE ATIVIDADES</small>
                  <h2>{dayLabel(selected)}</h2>
                  {!daily.length && (
                    <p className="attendance-empty">
                      Nenhum ponto registrado neste dia. Use o botão de entrada
                      para iniciar sua atividade hoje.
                    </p>
                  )}
                  <div className="attendance-records">
                    {daily.map((r) => (
                      <article key={r.id}>
                        <div className="attendance-record-heading">
                          <strong>
                            {formatTime(r.startedAt)} → {formatTime(r.endedAt)}
                          </strong>
                          <button disabled={busy} onClick={() => edit(r)}>
                            {" "}
                            {r.endedAt
                              ? "Editar relatório"
                              : "Preencher relatório"}
                          </button>
                        </div>
                        <small>{r.role}</small>
                        <h3>Conteúdo passado</h3>
                        <p>{r.content || "Ainda não informado."}</p>
                        <h3>Atividades realizadas</h3>
                        <p>{r.activities || "Ainda não informadas."}</p>
                        {r.notes && (
                          <>
                            <h3>Observações</h3>
                            <p>{r.notes}</p>
                          </>
                        )}
                      </article>
                    ))}
                  </div>
                  {editing && (
                    <form
                      className="attendance-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        save("report");
                      }}
                    >
                      <h3>Relatório · {formatTime(editing.startedAt)}</h3>
                      <fieldset disabled={busy}>
                        <label htmlFor="attendance-content">
                          Conteúdo passado
                        </label>
                        <textarea
                          id="attendance-content"
                          rows={3}
                          maxLength={2000}
                          value={report.content}
                          onChange={(e) =>
                            setReport({ ...report, content: e.target.value })
                          }
                          placeholder="Temas abordados, orientações e materiais utilizados"
                        />
                        <label htmlFor="attendance-activities">
                          O que você fez?
                        </label>
                        <textarea
                          id="attendance-activities"
                          rows={4}
                          maxLength={4000}
                          value={report.activities}
                          onChange={(e) =>
                            setReport({ ...report, activities: e.target.value })
                          }
                          placeholder="Descreva as atividades e os resultados"
                        />
                        <label htmlFor="attendance-notes">
                          Observações (opcional)
                        </label>
                        <textarea
                          id="attendance-notes"
                          rows={2}
                          maxLength={2000}
                          value={report.notes}
                          onChange={(e) =>
                            setReport({ ...report, notes: e.target.value })
                          }
                        />
                        <div className="attendance-form-actions">
                          <button type="submit">
                            {busy ? "Salvando..." : "Salvar relatório"}
                          </button>
                          {!editing.endedAt && (
                            <button
                              type="button"
                              disabled={!report.activities.trim()}
                              onClick={() => save("finish")}
                            >
                              Salvar e registrar saída
                            </button>
                          )}
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => setEditing(null)}
                          >
                            Cancelar
                          </button>
                        </div>
                      </fieldset>
                    </form>
                  )}
                </section>
              </div>
            </>
          )}
        </div>
      </main>
    </AuthGuard>
  );
}
