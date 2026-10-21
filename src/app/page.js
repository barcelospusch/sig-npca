"use client";

import AuthGuard from "@/components/AuthGuard";
import MemberModal from "@/components/MemberModal";
import Navbar from "@/components/Navbar";
import OrgChart from "@/components/OrgChart";
import { db } from "@/firebase";
import {
  getMemberPositions,
  hasRoleAccumulation,
  isExclusiveRole,
  organizationalUnits,
  unitLabel,
} from "@/organization";
import { PlusIcon } from "@phosphor-icons/react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

function registrationTime(member) {
  const createdAt = member.createdAt;
  if (typeof createdAt?.toMillis === "function") return createdAt.toMillis();
  if (typeof createdAt?.seconds === "number") return createdAt.seconds * 1000;
  const parsed = new Date(createdAt || 0).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function validatePositions(positions) {
  if (!positions.length) return "Adicione ao menos um cargo para o membro.";
  if (positions.some((position) => !position.unit || !position.role)) {
    return "Selecione uma unidade e uma função para cada cargo.";
  }
  if (positions.length > 1 && positions.some((position) => isExclusiveRole(position.role))) {
    return "Secretário e tesoureiro não podem acumular cargos.";
  }
  if (
    new Set(positions.map((position) => `${position.unit}:${position.role}`)).size !==
    positions.length
  ) {
    return "O mesmo cargo não pode ser adicionado mais de uma vez.";
  }
  return "";
}

export default function HomePage() {
  const [members, setMembers] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [unit, setUnit] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("name");

  useEffect(() => {
    const q = query(collection(db, "members"));
    return onSnapshot(q, (snap) =>
      setMembers(snap.docs.map((document) => ({ id: document.id, ...document.data() }))),
    );
  }, []);

  const filtered = useMemo(() => {
    const searchTerm = search.trim().toLocaleLowerCase("pt-BR");
    return members
      .filter((member) => {
        const positions = getMemberPositions(member);
        const matchesUnit =
          unit === "all" || positions.some((position) => position.unit === unit);
        const matchesStatus = status === "all" || member.status === status;
        const matchesSearch =
          !searchTerm ||
          [member.name, member.email]
            .filter(Boolean)
            .some((value) => value.toLocaleLowerCase("pt-BR").includes(searchTerm));
        return matchesUnit && matchesStatus && matchesSearch;
      })
      .sort((first, second) =>
        sortBy === "createdAt"
          ? registrationTime(second) - registrationTime(first)
          : String(first.name || "").localeCompare(String(second.name || ""), "pt-BR"),
      );
  }, [members, search, sortBy, status, unit]);

  const active = members.filter((member) => member.status === "ativo").length;
  const occupied = new Set(
    members
      .filter((member) => member.status === "ativo")
      .flatMap((member) => getMemberPositions(member).map((position) => position.unit)),
  ).size;
  const orientador = members.find(
    (member) =>
      member.status === "ativo" &&
      getMemberPositions(member).some((position) => position.unit === "professor-orientador"),
  );

  async function saveMember(form) {
    const positions = Array.isArray(form.positions)
      ? form.positions
      : getMemberPositions(form);
    const validationError = validatePositions(positions);
    if (validationError) {
      window.alert(validationError);
      return;
    }
    const memberData = {
      ...form,
      positions,
      unit: positions[0].unit,
      role: positions[0].role,
      updatedAt: serverTimestamp(),
    };

    if (selected) {
      await updateDoc(doc(db, "members", selected.id), memberData);
    } else {
      await addDoc(collection(db, "members"), {
        ...memberData,
        createdAt: serverTimestamp(),
      });
    }
    setModalOpen(false);
    setSelected(null);
  }

  async function removeMember() {
    if (!selected || !confirm(`Excluir ${selected.name}?`)) return;
    await deleteDoc(doc(db, "members", selected.id));
    setModalOpen(false);
    setSelected(null);
  }

  return (
    <AuthGuard>
      <Navbar />
      <main className="members-page">
        <div className="members-container">
          <div className="statistics-header">
            <div>
              <small>SIG-NPCA</small>
              <h1>Gestão Institucional</h1>
              <p className="statistics-intro">
                Gerencie membros, funções, diretorias e o professor orientador.
              </p>
            </div>
          </div>

          <div className="statistics-kpis">
            <div className="statistics-kpi statistics-kpi-accent">
              <span>Membros ativos</span>
              <strong>{active}</strong>
              <small>em todas as unidades</small>
            </div>
            <div className="statistics-kpi">
              <span>Unidades ocupadas</span>
              <strong>{occupied}</strong>
              <small>de {organizationalUnits.length}</small>
            </div>
            <div className="statistics-kpi">
              <span>Total cadastrado</span>
              <strong>{members.length}</strong>
              <small>ativos e inativos</small>
            </div>
            <div className="statistics-kpi">
              <span>Professor orientador</span>
              <strong style={{ fontSize: "1.15rem" }}>
                {orientador?.name || "Não definido"}
              </strong>
              <small>{orientador?.institution || ""}</small>
            </div>
          </div>

          <div className="members-toolbar">
            <div className="members-filters">
              <input
                type="search"
                className="login-input members-search"
                placeholder="Pesquisar membro..."
                aria-label="Pesquisar membro por nome ou e-mail"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <select
                className="login-input"
                aria-label="Filtrar por unidade"
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
              >
                <option value="all">Todas as unidades</option>
                {organizationalUnits.map((organizationalUnit) => (
                  <option value={organizationalUnit.slug} key={organizationalUnit.slug}>
                    {organizationalUnit.title}
                  </option>
                ))}
              </select>
              <select
                className="login-input"
                aria-label="Filtrar por status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="all">Todos os status</option>
                <option value="ativo">Ativos</option>
                <option value="inativo">Inativos</option>
              </select>
              <select
                className="login-input"
                aria-label="Ordenar membros"
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value)}
              >
                <option value="name">Ordem alfabética</option>
                <option value="createdAt">Data de cadastro (mais recente)</option>
              </select>
            </div>
            <button
              className="withicon member-create-trigger"
              onClick={() => {
                setSelected(null);
                setModalOpen(true);
              }}
            >
              <PlusIcon size={18} />
              <span>Novo membro</span>
            </button>
          </div>

          <p className="members-count">{filtered.length} registro(s)</p>
          <div className="table-responsive members-table">
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Unidade</th>
                  <th>Função</th>
                  <th>Status</th>
                  <th>Instituição</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((member) => {
                  const positions = getMemberPositions(member);
                  const accumulatedRoles = hasRoleAccumulation(member);
                  return (
                    <tr key={member.id}>
                      <td>
                        <div className="member-name-cell">
                          <button
                            className="member-name-button"
                            onClick={() => {
                              setSelected(member);
                              setModalOpen(true);
                            }}
                          >
                            {member.name}
                          </button>
                          {accumulatedRoles && (
                            <span className="member-accumulation-badge">
                              Acúmulo de cargos
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="member-position-list">
                          {positions.map((position) => (
                            <span key={`${position.unit}-${position.role}`}>
                              {unitLabel(position.unit)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <div className="member-position-list">
                          {positions.map((position) => (
                            <span key={`${position.unit}-${position.role}`}>
                              {position.role}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <span
                          className={`member-role ${member.status === "ativo" ? "member-status-active" : "member-status-inactive"}`}
                        >
                          {member.status}
                        </span>
                      </td>
                      <td>{member.institution || "—"}</td>
                    </tr>
                  );
                })}
                {!filtered.length && (
                  <tr>
                    <td colSpan="5" className="members-empty">
                      Nenhum membro encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <OrgChart members={members} />
        </div>
      </main>
      <MemberModal
        open={modalOpen}
        member={selected}
        onClose={() => {
          setModalOpen(false);
          setSelected(null);
        }}
        onSave={saveMember}
        onDelete={removeMember}
      />
    </AuthGuard>
  );
}
