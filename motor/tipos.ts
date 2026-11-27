export type Classe =
| "renda_fixa_pos"
| "renda_fixa_pre"
| "renda_fixa_ipca"
| "acoes"
| "fiis"
| "internacional"
| "cripto"
| "caixa"
| "outros";

export interface Ativo{
    nome: string;
    classe: Classe;
    valorCentavos: number;
    //opcionais: vem do cadastro (ex.: indexador "CDI" com taxa 110 = 110% do CDI)
    indexador?: string | null;
    taxaIndexador?: number | null;
}
export type TipoPerfil = "conservador" | "moderado" | "arrojado";
export interface Perfil{
    tipo: TipoPerfil;
    excluir: Classe[];
}
//mapa classe:quantidade 
//record monta o tipo do objeto, a partir das
//chaves e dos valores, e o partial torna os 
//campos opcionais
export type Alocacao = Partial<Record<Classe, number>>;

//indicadores do Banco Central, em % ao ano (ipca12mPct = acumulado 12 meses)
export interface Indicadores{
    selicPct: number;
    cdiPct: number;
    ipca12mPct: number;
}

//o que o app manda para o motor a cada check-in
export interface EntradaMotor{
    carteira: Ativo[];
    perfil: Perfil;
    alvo: Alocacao; //alocacao-alvo salva no perfil do usuario
    aporteCentavos: number;
    horizonteMeses: number;
    indicadores: Indicadores;
}

//resultado de uma classe dentro do check-in
export interface ResultadoClasse{
    classe: Classe;
    valorCentavos: number; //quanto tem hoje na classe
    atualPct: number;
    alvoPct: number;
    desvioPct: number; //atualPct - alvoPct, em pontos percentuais
    aporteCentavos: number; //parte do aporte sugerida para a classe
    posAportePct: number; //percentual da classe depois do aporte
}

//o que o motor devolve para o app (rotas, historico, IA e banco usam isso)
export interface ResultadoMotor{
    totalCentavos: number;
    aporteCentavos: number;
    totalPosAporteCentavos: number;
    classes: ResultadoClasse[];
    aderencia: number; //0 a 100
    aderenciaPosAporte: number; //0 a 100
    rendimentoAnualPct: number; //nominal estimado da carteira
    rendimentoRealPct: number; //descontada a inflacao
    juroRealPct: number; //selic contra ipca 12m
    versao: string;
}
