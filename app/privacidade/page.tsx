import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Política de Privacidade — Tio Rico",
  description:
    "Como o Tio Rico coleta, utiliza e protege seus dados pessoais na plataforma.",
};

export default function PrivacidadePage() {
  return (
    <div className="min-h-svh bg-background px-6 py-12 sm:px-10">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-3 border-b border-border pb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <span className="font-k2d text-lg font-bold tracking-tight text-(--green-2)">
              TIO RICO
            </span>
            <Button
              render={<Link href="/login" />}
              nativeButton={false}
              variant="outline"
              size="sm"
              className="w-auto justify-center border border-(--green-1) px-3 font-k2d text-sm text-(--green-2)"
            >
              Voltar para o login
            </Button>
          </div>
          <h1 className="h1">Política de Privacidade</h1>
          <p className="p-muted">Última atualização: 28 de novembro de 2026</p>
        </header>

        <section className="space-y-3">
          <h2 className="h4">1. Sobre o Tio Rico</h2>
          <p className="font-ibm-plex text-sm leading-6 text-foreground/90">
            O Tio Rico é uma plataforma educacional de acompanhamento de carteira
            e check-ins mensais de investimentos desenvolvida no âmbito do Hack
            Brasil 2026. As análises e simulações exibidas têm caráter
            exclusivamente educativo e não constituem recomendação de compra ou
            venda de ativos ou consultoria financeira regulada.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="h4">2. Dados que coletamos</h2>
          <ul className="list-disc space-y-2 pl-5 font-ibm-plex text-sm leading-6 text-foreground/90">
            <li>
              <strong>Dados de autenticação:</strong> ao entrar com Google OAuth
              ou com código por e-mail, recebemos apenas seu endereço de e-mail
              e nome básico de exibição para identificar sua conta.
            </li>
            <li>
              <strong>Dados de carteira e perfil:</strong> perfil de risco,
              horizonte, metas, ativos e check-ins mensais informados
              manualmente por você dentro da plataforma. Não solicitamos senhas
              bancárias nem conectamos contas de corretoras.
            </li>
            <li>
              <strong>Conta de demonstração:</strong> gera uma cópia temporária
              e isolada com dados fictícios, excluída automaticamente após 24
              horas.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="h4">3. Como usamos os dados e terceiros</h2>
          <ul className="list-disc space-y-2 pl-5 font-ibm-plex text-sm leading-6 text-foreground/90">
            <li>
              Persistir seu histórico e calcular métricas determinísticas de
              aderência e evolução da carteira no banco de dados PostgreSQL.
            </li>
            <li>
              Integrar autenticação via Google OAuth ou envio de código por
              e-mail via Resend, além de consultar séries públicas do Banco
              Central (BCB SGS) e gerar explicações educacionais via modelos de
              IA para o próprio titular da conta.
            </li>
            <li>
              Não vendemos, alugamos nem compartilhamos seus dados com terceiros
              para fins comerciais ou publicitários.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="h4">4. Cookies, retenção e segurança</h2>
          <p className="font-ibm-plex text-sm leading-6 text-foreground/90">
            Utilizamos apenas cookies essenciais de sessão autenticada (JWT com
            validade de até 7 dias para contas regulares e 24 horas para contas
            de demonstração) e registros temporários de limite de requisições
            para proteger a aplicação contra abuso. Não utilizamos cookies de
            rastreamento publicitário.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="h4">5. Seus direitos e contato</h2>
          <p className="font-ibm-plex text-sm leading-6 text-foreground/90">
            Em conformidade com a LGPD, você pode editar ou solicitar a remoção
            dos dados vinculados à sua conta a qualquer momento. Dúvidas ou
            solicitações podem ser registradas pelo repositório oficial do
            projeto em{" "}
            <a
              href="https://github.com/ThiagoGama1/tio_rico"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-(--green-1) underline underline-offset-4"
            >
              github.com/ThiagoGama1/tio_rico
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
