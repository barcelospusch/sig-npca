"use client";

import AuthGuard from "@/components/AuthGuard";
import Navbar from "@/components/Navbar";
import { auth, db } from "@/firebase";
import { canPublishDocuments } from "@/organization";
import {
  FileTextIcon,
  MagnifyingGlassIcon,
  PaperclipIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react";
import { upload } from "@vercel/blob/client";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const BLOB_PUBLIC_HOST = "hqlu7hdikkpu6spm.public.blob.vercel-storage.com";

function formatDate(value) {
  const date = value?.toDate?.() || (value ? new Date(value) : null);
  if (!date || Number.isNaN(date.getTime())) return "Data não disponível";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function loadDocuments(user) {
  const response = await fetch("/api/documents", {
    headers: { Authorization: `Bearer ${await user.getIdToken()}` },
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || "Não foi possível carregar os documentos.");
  }
  return result.documents;
}

export default function DocumentsPage() {
  const [user, setUser] = useState(null);
  const [member, setMember] = useState(null);
  const [memberLoading, setMemberLoading] = useState(true);
  const [memberError, setMemberError] = useState("");
  const [documents, setDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [documentsError, setDocumentsError] = useState("");
  const [search, setSearch] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const categories = [
    "Resolução",
    "Portaria",
    "Edital",
    "Edital Normativo",
    "Edital de Convocação",
    "Edital de Retificação",
    "Edital de Resultado",
    "Comunicado",
    "Circular",
    "Instrução Normativa",
    "Deliberação",
    "Ata",
    "Termo",
    "Ofício",
    "Parecer",
    "Relatório"
  ]

  useEffect(() => {
    let unsubscribeMembers;
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (unsubscribeMembers) unsubscribeMembers();
      setMember(null);
      setMemberError("");
      setMemberLoading(Boolean(currentUser));

      if (!currentUser?.email) {
        setMemberLoading(false);
        return;
      }

      unsubscribeMembers = onSnapshot(
        collection(db, "members"),
        (snapshot) => {
          const normalizedEmail = currentUser.email.trim().toLocaleLowerCase("pt-BR");
          const matchingMember = snapshot.docs
            .map((document) => ({ id: document.id, ...document.data() }))
            .find(
              (candidate) =>
                String(candidate.email || "").trim().toLocaleLowerCase("pt-BR") ===
                normalizedEmail,
            );
          setMember(matchingMember || null);
          setMemberLoading(false);
        },
        (error) => {
          console.error("Falha ao verificar o vínculo do membro:", error);
          setMemberError("Não foi possível verificar seu cargo. Tente novamente mais tarde.");
          setMemberLoading(false);
        },
      );
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeMembers) unsubscribeMembers();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setDocuments([]);
      setDocumentsLoading(false);
      return undefined;
    }

    let active = true;
    setDocumentsLoading(true);
    loadDocuments(user)
      .then((items) => {
        if (!active) return;
        setDocuments(items);
        setDocumentsError("");
      })
      .catch((error) => {
        if (!active) return;
        console.error("Falha ao carregar os documentos:", error);
        setDocumentsError("Não foi possível carregar os documentos.");
      })
      .finally(() => {
        if (!active) return;
        setDocumentsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user]);

  const canPublish = canPublishDocuments(member);
  const filteredDocuments = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return documents;

    return documents.filter((document) =>
      [
        document.title,
        document.description,
        document.category,
        document.fileName,
        document.uploaderName,
      ].some((value) => String(value || "").toLocaleLowerCase("pt-BR").includes(term)),
    );
  }, [documents, search]);

  async function publishDocument(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setUploadError("");

    if (!canPublish || !user) {
      setUploadError("Sua conta não tem permissão para publicar documentos.");
      return;
    }
    if (!file) {
      setUploadError("Selecione um arquivo para anexar.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setUploadError("O arquivo deve ter no máximo 20 MB.");
      return;
    }

    setUploading(true);
    try {
      const safeFileName = file.name.replace(/[^\w.-]/g, "_");
      const blob = await upload(
        `documents/${user.uid}/${crypto.randomUUID()}-${safeFileName}`,
        file,
        {
          access: "public",
          handleUploadUrl: "/api/documents/upload",
          headers: { Authorization: `Bearer ${await user.getIdToken()}` },
          contentType: file.type,
          multipart: file.size > 4.5 * 1024 * 1024,
        },
      );
      if (new URL(blob.url).hostname !== BLOB_PUBLIC_HOST) {
        throw new Error("O token de armazenamento aponta para outro Blob store.");
      }

      const metadataResponse = await fetch("/api/documents", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await user.getIdToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: title.trim(),
          category: category.trim(),
          description: description.trim(),
          fileName: file.name,
          fileUrl: blob.url,
        }),
      });
      const metadataResult = await metadataResponse.json();
      if (!metadataResponse.ok) {
        throw new Error(
          metadataResult.error || "Não foi possível salvar os dados do documento.",
        );
      }

      const updatedDocuments = await loadDocuments(user);
      setDocuments(updatedDocuments);

      setTitle("");
      setDescription("");
      setCategory("");
      setFile(null);
      form.reset();
    } catch (error) {
      console.error("Falha ao publicar o documento:", error);
      setUploadError("Não foi possível publicar o documento. Verifique sua conexão e tente novamente.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <AuthGuard>
      <Navbar />
      <main className="documents-page">
        <div className="documents-container">
          <header className="documents-header">
            <div>
              <small>SIG-NPCA / ARQUIVO INSTITUCIONAL</small>
              <h1>Documentos</h1>
              <p>Consulte documentos e materiais publicados pelo núcleo.</p>
            </div>
            <span className="documents-count">
              {documents.length} {documents.length === 1 ? "documento" : "documentos"}
            </span>
          </header>

          {memberLoading && <p className="documents-notice">Verificando permissão de publicação...</p>}
          {memberError && <p className="documents-error" role="alert">{memberError}</p>}
          {!memberLoading && !memberError && !canPublish && (
            <p className="documents-notice">
              A publicação está disponível apenas para diretores, secretário, tesoureiro e professor orientador ativos.
            </p>
          )}

          {canPublish && (
            <section className="documents-publish">
              <div className="documents-section-heading">
                <div>
                  <small>PUBLICAÇÃO</small>
                  <h2>Novo documento</h2>
                </div>
                <UploadSimpleIcon size={25} aria-hidden="true" />
              </div>
              <form className="documents-form" onSubmit={publishDocument}>
                <div className="documents-form-grid">
                  <div className="input-group">
                    <label htmlFor="document-title">Título</label>
                    <input
                      id="document-title"
                      className="login-input"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      maxLength={120}
                      placeholder="Ex.: N° XX/YYYY"
                      required
                    />
                  </div>
                  <div className="input-group">
                    <label htmlFor="document-category">Categoria</label>
                    <select
                      id="document-category"
                      className="login-input"
                      value={category}
                      onChange={(event) => setCategory(event.target.value)}
                      required
                    >
                      <option value="" disabled>Selecione uma categoria</option>
                      {categories.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                  </div>
                  <div className="input-group documents-description">
                    <label htmlFor="document-description">Descrição</label>
                    <textarea
                      id="document-description"
                      className="login-input"
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder="Contextualize o documento para os demais membros."
                      maxLength={1000}
                      rows={3}
                    />
                  </div>
                  <div className="input-group documents-file-field">
                    <label htmlFor="document-file">Arquivo anexo (máximo 20 MB)</label>
                    <input
                      id="document-file"
                      className="login-input"
                      type="file"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.rtf,.txt,.csv,.zip,.jpg,.jpeg,.png,.webp"
                      onChange={(event) => setFile(event.target.files?.[0] || null)}
                      required
                    />
                    {file && <small>{file.name} · {formatFileSize(file.size)}</small>}
                  </div>
                </div>
                {uploadError && <p className="documents-error" role="alert">{uploadError}</p>}
                <button className="withicon documents-submit" type="submit" disabled={uploading}>
                  <UploadSimpleIcon size={18} />
                  {uploading ? "Publicando..." : "Publicar documento"}
                </button>
              </form>
            </section>
          )}

          <section className="documents-library">
            <div className="documents-library-heading">
              <div>
                <small>ACERVO</small>
                <h2>Todos os documentos</h2>
              </div>
              <label className="documents-search">
                <MagnifyingGlassIcon size={18} aria-hidden="true" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar documentos"
                  aria-label="Buscar documentos"
                />
              </label>
            </div>

            {documentsError && <p className="documents-error" role="alert">{documentsError}</p>}
            {documentsLoading ? (
              <p className="documents-empty">Carregando documentos...</p>
            ) : filteredDocuments.length ? (
              <div className="documents-grid">
                {filteredDocuments.map((document) => (
                  <article className="document-card" key={document.id}>
                    <div className="document-card-icon"><FileTextIcon size={24} /></div>
                    <div className="document-card-content">
                      <div className="document-card-meta">
                        <span>{document.category || "Documento"}</span>
                        <time>{formatDate(document.uploadedAt)}</time>
                      </div>
                      <h3>{document.title || document.fileName}</h3>
                      {document.description && <p>{document.description}</p>}
                      <small className="document-uploader">
                        Publicado por {document.uploaderName || "Membro"}
                      </small>
                      <a
                        className="document-download"
                        href={document.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <PaperclipIcon size={17} />
                        <span>{document.fileName || "Abrir anexo"}</span>
                        {document.fileSize > 0 && <small>{formatFileSize(document.fileSize)}</small>}
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="documents-empty">
                {search ? "Nenhum documento corresponde à busca." : "Ainda não há documentos publicados."}
              </p>
            )}
          </section>
        </div>
      </main>
    </AuthGuard>
  );
}
