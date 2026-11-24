import { EntradaMotor, ResultadoMotor } from "./tipos";

export const VERSAO_MOTOR = "motor-v1";

//ponto de ligacao com o app: as rotas de check-in, o seed e a IA chamam esta funcao.
//junta alocacao, alvo, desvio, aporte e projecao e devolve um ResultadoMotor.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function gerarDiagnostico(entrada: EntradaMotor): ResultadoMotor {
    throw new Error("gerarDiagnostico ainda não foi implementado");
}
