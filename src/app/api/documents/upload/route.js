import { handleUpload } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { canPublishDocuments } from "@/organization";
import { getFirebaseSession } from "@/firebase-session";
import { collection, getDocs } from "firebase/firestore";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const DOCUMENTS_PREFIX = "documents/";
const ALLOWED_CONTENT_TYPES = [
  "application/pdf",
  "application/msword",
  "application/rtf",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
  "application/zip",
  "text/csv",
  "text/plain",
  "image/jpeg",
  "image/png",
  "image/webp",
];

function jsonError(message, status) {
  return NextResponse.json({ error: message }, { status });
}

async function authorizePublisher(request) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { error: jsonError("Autenticação necessária.", 401) };

  let decodedToken, db;
  try {
    ({ user: decodedToken, db } = await getFirebaseSession(request));
  } catch (error) {
    console.error("Falha ao validar o token Firebase:", error);
    const status = String(error?.code || "").startsWith("auth/") ? 401 : 500;
    return {
      error: jsonError(
        status === 401
          ? "Sua sessão expirou. Entre novamente."
          : "Não foi possível validar sua sessão.",
        status,
      ),
    };
  }

  if (!decodedToken.email) {
    return { error: jsonError("A conta autenticada não possui e-mail.", 403) };
  }

  try {
    const memberSnapshot = await getDocs(collection(db, "members"));
    const normalizedEmail = decodedToken.email.trim().toLocaleLowerCase("pt-BR");
    const matches = memberSnapshot.docs.filter(
      (document) =>
        String(document.get("email") || "").trim().toLocaleLowerCase("pt-BR") ===
        normalizedEmail,
    );

    if (matches.length !== 1 || !canPublishDocuments(matches[0]?.data())) {
      return { error: jsonError("Sua conta não tem permissão para publicar documentos.", 403) };
    }

    return { uid: decodedToken.uid, member: matches[0].data() };
  } catch (error) {
    console.error("Falha ao autorizar publicação de documento:", error);
    return { error: jsonError("Não foi possível validar sua permissão.", 500) };
  }
}

export async function POST(request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("BLOB_READ_WRITE_TOKEN não está configurado.");
    return jsonError("O armazenamento de arquivos não está configurado.", 500);
  }

  try {
    const body = await request.json();
    let publisher;
    if (body.type === "blob.generate-client-token") {
      publisher = await authorizePublisher(request);
      if (publisher.error) return publisher.error;
    } else if (body.type !== "blob.upload-completed") {
      return jsonError("Evento de upload inválido.", 400);
    }

    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname) => {
        if (!publisher) throw new Error("Publicador não autenticado.");

        const prefix = `${DOCUMENTS_PREFIX}${publisher.uid}/`;
        const fileName = pathname.startsWith(prefix)
          ? pathname.slice(prefix.length)
          : "";
        if (
          !fileName ||
          fileName.includes("/") ||
          fileName.includes("..") ||
          fileName.length > 180
        ) {
          throw new Error("Caminho de arquivo inválido.");
        }

        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_FILE_SIZE,
          addRandomSuffix: true,
        };
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Falha ao preparar upload do documento:", error);
    return jsonError("Não foi possível preparar o envio do anexo.", 400);
  }
}
