import { NextResponse } from "next/server";
import { getFirebaseSession } from "@/firebase-session";
import { collection, doc, getDocs, query, where, runTransaction, serverTimestamp } from "firebase/firestore";
import { getMemberPositions } from "@/organization";
import { localDay } from "@/attendance";

export const runtime = "nodejs";
const fail = (error, status) => NextResponse.json({ error }, { status });

async function authorize(request) {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { error: fail("Entre na sua conta para continuar.", 401) };
  let user, db;
  try { ({ user, db } = await getFirebaseSession(request)); }
  catch (error) {
    console.error("Falha ao validar sessão do ponto:", error);
    return { error: fail("Sua sessão expirou. Entre novamente.", 401) };
  }
  const snapshot = await getDocs(collection(db, "members"));
  const matches = snapshot.docs.filter(
    (doc) =>
      user.email &&
      String(doc.get("email") || "")
        .trim()
        .toLowerCase() === user.email.trim().toLowerCase(),
  );
  const member = matches.length === 1 ? matches[0].data() : null;
  const position =
    member?.status === "ativo" &&
    getMemberPositions(member).find(
      (p) =>
        p.unit === "diretoria-orientacao" &&
        ["Assessor", "Orientador", "Diretor de Orientação"].includes(p.role),
    );
  if (!position)
    return {
      error: fail(
        "Acesso disponível para assessores, orientadores e diretor ativos da Diretoria de Orientação. Confira o e-mail do seu cadastro.",
        403,
      ),
    };
  return { user, member, memberId: matches[0].id, position, db };
}

export async function GET(request) {
  try {
    const account = await authorize(request);
    if (account.error) return account.error;
    const month = new URL(request.url).searchParams.get("month");
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || ""))
      return fail("Mês inválido.", 400);
    const snapshot = await getDocs(query(collection(account.db, "orientationAttendance"), where("uid", "==", account.user.uid)));
    const all = snapshot.docs.map((item) => {
      const value = item.data();
      for (const key of ["startedAt", "endedAt", "updatedAt"]) {
        if (value[key]?.toDate) value[key] = value[key].toDate().toISOString();
      }
      return { ...value, id: item.id };
    });
    const active = all.find((record) => !record.endedAt) || null;
    return NextResponse.json(
      {
        member: {
          name: account.member.name || account.user.email,
          role: account.position.role,
        },
        records: all
          .filter((r) => String(r.date || "").startsWith(month))
          .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
        active,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Falha ao consultar ponto:", error);
    if (error.code === "permission-denied") return fail("Acesso negado pelo Firestore. Publique as regras de firestore.rules no projeto Firebase.", 403);
    return fail("Não foi possível carregar seus registros.", 500);
  }
}

export async function POST(request) {
  try {
    const account = await authorize(request);
    if (account.error) return account.error;
    let body;
    try {
      body = await request.json();
    } catch {
      return fail("Dados inválidos.", 400);
    }
    if (!["start", "finish", "report"].includes(body.action))
      return fail("Ação inválida.", 400);
    const report = {};
    for (const [key, max] of [
      ["content", 2000],
      ["activities", 4000],
      ["notes", 2000],
    ]) {
      if (body.action === "start") break;
      if (typeof body[key] !== "string" || body[key].trim().length > max)
        return fail("Revise os campos e seus limites de caracteres.", 400);
      report[key] = body[key].trim();
    }
    if (body.action === "finish" && !report.activities)
      return fail(
        "Descreva as atividades realizadas antes de registrar a saída.",
        400,
      );
    const lock = doc(account.db, "orientationAttendanceActive", account.user.uid);
    const newRef = doc(collection(account.db, "orientationAttendance"));
    await runTransaction(account.db, async (tx) => {
      const current = await tx.get(lock);
      const now = new Date();
      if (body.action === "start") {
        if (current.exists())
          throw new Error(
            "Já existe um ponto em andamento. Registre a saída primeiro.",
          );
        tx.set(newRef, {
          uid: account.user.uid,
          memberId: account.memberId,
          memberName: account.member.name || account.user.email,
          role: account.position.role,
          date: localDay(now),
          startedAt: serverTimestamp(),
          endedAt: null,
          content: "",
          activities: "",
          notes: "",
        });
        tx.set(lock, { recordId: newRef.id });
        return;
      }
      if (typeof body.id !== "string" || !/^[a-zA-Z0-9]{20}$/.test(body.id))
        throw new Error("Registro inválido.");
      const ref = doc(account.db, "orientationAttendance", body.id);
      const record = await tx.get(ref);
      if (!record.exists() || record.get("uid") !== account.user.uid)
        throw new Error("Registro não encontrado.");
      if (body.action === "finish") {
        if (record.get("endedAt") || current.get("recordId") !== body.id)
          throw new Error("Este ponto já foi encerrado. Atualize a página.");
        tx.update(ref, {
          ...report,
          endedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        tx.delete(lock);
      } else tx.update(ref, { ...report, updatedAt: serverTimestamp() });
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Falha ao registrar ponto:", error);
    if (error.code === "permission-denied") return fail("Acesso negado pelo Firestore. Confira as regras de ponto e seu vínculo cadastrado.", 403);
    const expected = /^(Já existe|Registro|Este ponto)/.test(error.message);
    return fail(
      expected ? error.message : "Não foi possível salvar. Tente novamente.",
      expected ? 409 : 500,
    );
  }
}
