import { createHash } from "node:crypto";
import { del, head, list, put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { getFirebaseSession } from "@/firebase-session";
import { collection, getDocs } from "firebase/firestore";
import { canPublishDocuments } from "@/organization";

const DOCUMENT_METADATA_PREFIX = "documents/metadata/";
const BLOB_PUBLIC_HOST = "hqlu7hdikkpu6spm.public.blob.vercel-storage.com";
const DOCUMENTS_PREFIX = "documents/";
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set([
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
]);

export const runtime = "nodejs";

function jsonError(message, status) {
  return NextResponse.json({ error: message }, { status });
}

async function getVerifiedUser(request, requirePublisher = false) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { error: jsonError("Autenticação necessária.", 401) };

  try {
    const { user: decodedToken, db } = await getFirebaseSession(request);
    if (!requirePublisher) return { uid: decodedToken.uid };
    if (!decodedToken.email) {
      return { error: jsonError("A conta autenticada não possui e-mail.", 403) };
    }

    const memberSnapshot = await getDocs(collection(db, "members"));
    const normalizedEmail = decodedToken.email.trim().toLocaleLowerCase("pt-BR");
    const matches = memberSnapshot.docs.filter(
      (document) =>
        String(document.get("email") || "").trim().toLocaleLowerCase("pt-BR") ===
        normalizedEmail,
    );
    if (matches.length !== 1 || !canPublishDocuments(matches[0]?.data())) {
      return {
        error: jsonError("Sua conta não tem permissão para publicar documentos.", 403),
      };
    }

    return { uid: decodedToken.uid, email: decodedToken.email, member: matches[0].data() };
  } catch (error) {
    console.error("Falha ao autenticar consulta aos documentos:", error);
    return { error: jsonError("Não foi possível validar sua sessão.", String(error.code || "").startsWith("auth/") ? 401 : 500) };
  }
}

export async function GET(request) {
  const user = await getVerifiedUser(request);
  if (user.error) return user.error;
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("BLOB_READ_WRITE_TOKEN não está configurado.");
    return jsonError("O armazenamento de arquivos não está configurado.", 500);
  }

  try {
    const metadataBlobs = [];
    let cursor;
    do {
      const page = await list({
        prefix: DOCUMENT_METADATA_PREFIX,
        limit: 1000,
        cursor,
      });
      metadataBlobs.push(...page.blobs);
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);

    const documents = await Promise.all(
      metadataBlobs.map(async (metadataBlob) => {
        if (new URL(metadataBlob.url).hostname !== BLOB_PUBLIC_HOST) {
          throw new Error("Metadados encontrados em um Blob store não reconhecido.");
        }

        const response = await fetch(metadataBlob.url, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Falha ao ler os metadados do Blob (${response.status}).`);
        }

        const document = await response.json();
        if (
          !document.id ||
          !document.title ||
          !document.fileUrl ||
          new URL(document.fileUrl).hostname !== BLOB_PUBLIC_HOST
        ) {
          throw new Error("Registro de documento inválido no Blob.");
        }
        return document;
      }),
    );

    documents.sort(
      (first, second) =>
        new Date(second.uploadedAt).getTime() - new Date(first.uploadedAt).getTime(),
    );
    return NextResponse.json({ documents });
  } catch (error) {
    console.error("Falha ao listar documentos no Vercel Blob:", error);
    return jsonError("Não foi possível carregar os documentos do armazenamento.", 500);
  }
}

export async function POST(request) {
  const publisher = await getVerifiedUser(request, true);
  if (publisher.error) return publisher.error;
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("BLOB_READ_WRITE_TOKEN não está configurado.");
    return jsonError("O armazenamento de arquivos não está configurado.", 500);
  }

  let fileUrl;
  try {
    const body = await request.json();
    const title = String(body.title || "").trim();
    const category = String(body.category || "").trim();
    const description = String(body.description || "").trim();
    const fileName = String(body.fileName || "").trim();
    fileUrl = String(body.fileUrl || "");
    const blobUrl = new URL(fileUrl);

    if (
      !title ||
      title.length > 120 ||
      !category ||
      category.length > 60 ||
      description.length > 1000 ||
      !fileName ||
      fileName.length > 255 ||
      blobUrl.protocol !== "https:" ||
      blobUrl.hostname !== BLOB_PUBLIC_HOST ||
      !blobUrl.pathname.startsWith(`/${DOCUMENTS_PREFIX}${publisher.uid}/`)
    ) {
      return jsonError("Os dados do documento ou do anexo são inválidos.", 400);
    }

    const fileDetails = await head(fileUrl);
    if (
      fileDetails.size > MAX_FILE_SIZE ||
      !ALLOWED_CONTENT_TYPES.has(fileDetails.contentType)
    ) {
      return jsonError("O tipo ou tamanho do anexo não é permitido.", 400);
    }

    const metadataPath = `${DOCUMENT_METADATA_PREFIX}${createHash("sha256")
      .update(fileUrl)
      .digest("hex")}.json`;
    await put(
      metadataPath,
      JSON.stringify({
        id: fileDetails.pathname,
        title,
        category,
        description,
        fileName,
        fileSize: fileDetails.size,
        contentType: fileDetails.contentType,
        filePath: fileDetails.pathname,
        fileUrl,
        uploaderUid: publisher.uid,
        uploaderEmail: publisher.email,
        uploaderName: publisher.member.name || publisher.email,
        uploadedAt: fileDetails.uploadedAt.toISOString(),
      }),
      {
        access: "public",
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: true,
      },
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Falha ao salvar os metadados do documento no Blob:", error);
    if (fileUrl) {
      try {
        const blobUrl = new URL(fileUrl);
        if (
          blobUrl.protocol === "https:" &&
          blobUrl.hostname === BLOB_PUBLIC_HOST &&
          blobUrl.pathname.startsWith(`/${DOCUMENTS_PREFIX}${publisher.uid}/`)
        ) {
          await del(fileUrl);
        }
      } catch (cleanupError) {
        console.error("Falha ao remover anexo sem metadados:", cleanupError);
      }
    }
    return jsonError("Não foi possível salvar os dados do documento no Blob.", 500);
  }
}
