export type Classe =
| "renda_fixa_pos"
| "renda_fixa_pre"
| "renda_fixa_ipca"
| "acoes"
| "fiis"
| "internacional"
| "cripto"
| "caixa";

export interface Ativo{
    nome: string;
    classe: Classe;
    valorCentavos: number;
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
