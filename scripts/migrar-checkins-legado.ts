/**
 * Corrige check-ins gravados com o `motorResult` no formato do adaptador
 * provisório antigo (`totalCurrentCents`, `allocations`, `adherenceScore`...).
 *
 * Sem correção, UM check-in nesse formato faz o repositório lançar
 * `RepositoryHydrationError` e derruba, para o perfil inteiro:
 * GET /api/checkins, GET /api/portfolio/evolution, GET /api/checkins/[id]
 * e até POST /api/checkins (que lê o histórico antes de salvar).
 *
 * Uso (lê DATABASE_URL de .env e .env.local, como o seed):
 *   npx tsx scripts/migrar-checkins-legado.ts                    # só mostra (padrão)
 *   npx tsx scripts/migrar-checkins-legado.ts --converter --aplicar
 *   npx tsx scripts/migrar-checkins-legado.ts --apagar --aplicar
 *
 * Sem `--aplicar`, nada é gravado. Tudo roda numa transação: ou corrige todos,
 * ou nenhum. Check-ins já no formato atual nunca são tocados.
 * Antes de rodar em produção, faça backup da tabela check_ins.
 */
import { config } from "dotenv";
import { Prisma } from "@prisma/client";
import { getPrisma } from "../lib/db/prisma";
import { classificarMotorResult } from "./legado-motor";

config();
config({ path: ".env.local", override: true });

type Modo = "mostrar" | "converter" | "apagar";

function lerModo(args: string[]): { modo: Modo; aplicar: boolean } {
  const converter = args.includes("--converter");
  const apagar = args.includes("--apagar");
  if (converter && apagar) {
    throw new Error("Use --converter OU --apagar, não os dois.");
  }
  return {
    modo: converter ? "converter" : apagar ? "apagar" : "mostrar",
    aplicar: args.includes("--aplicar"),
  };
}

/** Mostra só host e banco da DATABASE_URL, nunca usuário ou senha. */
function descreverBanco(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) return "(DATABASE_URL não definida)";
  try {
    const url = new URL(raw);
    return `${url.hostname}:${url.port || "5432"}${url.pathname}`;
  } catch {
    return "(DATABASE_URL inválida)";
  }
}

async function main() {
  const { modo, aplicar } = lerModo(process.argv.slice(2));
  const prisma = getPrisma();

  console.log(`Banco: ${descreverBanco()}`);
  console.log(`Modo: ${modo}${aplicar ? " (APLICANDO)" : " (simulação, nada é gravado)"}`);

  const linhas = await prisma.checkIn.findMany({
    select: { id: true, profileId: true, referenceMonth: true, motorResult: true },
    orderBy: [{ profileId: "asc" }, { referenceMonth: "asc" }],
  });

  const legados: Array<{ id: string; convertido: Prisma.InputJsonValue }> = [];
  const invalidos: string[] = [];
  for (const linha of linhas) {
    const r = classificarMotorResult(linha.motorResult);
    if (r.tipo === "legado") {
      legados.push({
        id: linha.id,
        convertido: JSON.parse(JSON.stringify(r.convertido)) as Prisma.InputJsonValue,
      });
      console.log(`  legado   ${linha.id} (${linha.profileId}, ${linha.referenceMonth})`);
    } else if (r.tipo === "invalido") {
      invalidos.push(linha.id);
      console.log(`  INVÁLIDO ${linha.id} (${linha.profileId}, ${linha.referenceMonth}): ${r.motivo}`);
    }
  }

  console.log(
    `Total: ${linhas.length} check-ins | ${legados.length} legados | ${invalidos.length} inválidos | ` +
      `${linhas.length - legados.length - invalidos.length} já no formato atual`,
  );

  if (invalidos.length > 0) {
    console.log("Há check-ins que não dá para converter. Revise-os à mão; nada foi alterado.");
    process.exitCode = 1;
    return;
  }
  if (modo === "mostrar" || legados.length === 0 || !aplicar) {
    if (modo !== "mostrar" && legados.length > 0) {
      console.log("Simulação concluída. Rode de novo com --aplicar para gravar.");
    }
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const item of legados) {
      if (modo === "converter") {
        await tx.checkIn.update({
          where: { id: item.id },
          data: { motorResult: item.convertido },
        });
      } else {
        // check_in_positions caem junto (onDelete: Cascade)
        await tx.checkIn.delete({ where: { id: item.id } });
      }
    }
  });
  console.log(`${modo === "converter" ? "Convertidos" : "Apagados"}: ${legados.length} check-ins.`);
}

main()
  .catch((error) => {
    console.error("Falha na migração:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
