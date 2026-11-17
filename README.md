# Tio Rico

Assistente de investimentos que lembra de você e faz a conta certa.

Projeto do Hack Brasil 2026, trilha **Pagamentos & finanças**.

## O problema

A maioria das pessoas que começa a investir não tem a quem perguntar. Consultor de investimentos é caro, e o que sobra é palpite de amigo, influenciador ou um chat de IA genérico.

Os chats de IA ajudam, mas têm três limitações:

- **Não lembram de você.** É preciso colar a carteira inteira e explicar o próprio perfil toda vez.
- **Erram nas contas.** Percentuais, rendimentos e simulações saem da cabeça do modelo e podem estar errados sem que a pessoa perceba.
- **Não acompanham a evolução.** Não sabem como a carteira estava meses atrás nem se a pessoa está chegando perto das metas.

## A solução

O Tio Rico junta o que um chat de IA faz bem (conversar, pesquisar e explicar) com o que ele faz mal (guardar contexto e calcular com precisão).

1. **Perfil do investidor.** Um questionário sobre objetivos, prazos, tolerância a risco e preferências. Fica salvo.
2. **Carteira salva.** Os investimentos são cadastrados uma vez e depois só atualizados.
3. **Check-in do mês.** A pessoa conta como foi o mês e quanto tem para investir, em texto livre.
4. **Motor de cálculo.** Usa dados oficiais do Banco Central (Selic, CDI e IPCA) para calcular a alocação atual, comparar com a ideal para o perfil e simular o aporte.
5. **Análise com IA.** A IA recebe o perfil, a carteira, os números calculados e notícias econômicas recentes, e explica em linguagem simples a situação e as opções de ajuste.
6. **Histórico.** Cada check-in fica registrado e mostra a evolução ao longo do tempo.

O Tio Rico analisa e explica. Ele não recomenda a compra de ativos específicos e não substitui um profissional certificado.

## Stack

- **Next.js + TypeScript** para front e backend no mesmo projeto
- **PostgreSQL** para os dados
- **API do Banco Central (SGS)** para indicadores econômicos
- **LLM** para a análise em linguagem natural
- **Firecrawl** para coletar notícias econômicas

## Como rodar

Em construção.

## Dados da demo

A demonstração usa apenas dados fictícios. Nenhuma informação financeira real de usuários é exposta.

## Time

- Thiago Gama
- Rafael Fassina
- Lucas

## Licença

MIT
