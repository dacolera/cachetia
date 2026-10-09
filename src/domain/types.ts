export interface Player {
  id: string;
  name: string;
  createdAt: string;
  /** Foto do rosto como data URL (JPEG quadrado e pequeno). */
  photo?: string;
  /** Arquivado some das listas de escolha, mas continua no histórico e no ranking. */
  archived?: boolean;
}

/** Jogador entrando na mesa: no início da partida ou no meio dela. */
export interface JoinEvent {
  type: 'join';
  id: string;
  at: string;
  playerId: string;
  points: number;
  /** Quem entra no meio senta logo antes de quem vai dar as cartas naquela rodada. */
  seatBefore?: string;
  /** Formato antigo: sentava logo depois deste jogador. Mantido para ler partidas já salvas. */
  seatAfter?: string;
}

/** Fim de rodada: um vencedor, os listados em `fled` fugiram e o resto da mesa jogou e perdeu. */
export interface RoundEvent {
  type: 'round';
  id: string;
  at: string;
  winnerId: string;
  fled: string[];
}

/**
 * "Livrar": jogadores ainda na mesa combinam proteção mútua. Se um deles vencer a
 * partida, devolve o valor casado a cada um com quem livrou. Pactos podem se sobrepor.
 */
export interface PactEvent {
  type: 'pact';
  id: string;
  at: string;
  playerIds: string[];
}

export type MatchEvent = JoinEvent | RoundEvent | PactEvent;

/**
 * A partida guarda só a sequência de eventos; placar, eliminações e vencedor
 * são sempre derivados dela. Isso deixa o desfazer trivial e facilita a
 * sincronização numa futura versão online.
 */
export interface Match {
  id: string;
  createdAt: string;
  /** Quem dá as cartas na primeira rodada. Daí em diante gira no sentido anti-horário. */
  firstDealerId?: string;
  /** Quem opera o tablet; fica sempre sentado embaixo, no centro da mesa. */
  cashierId?: string;
  /** Quanto cada jogador casa, em centavos. Partidas antigas não têm. */
  stakeCents?: number;
  /** Quando o prêmio foi pago pelo caixa. */
  paidOutAt?: string;
  finishedAt?: string;
  events: MatchEvent[];
}

export type RoundOutcome = 'won' | 'lost' | 'fled';

export interface Standing {
  playerId: string;
  points: number;
  /** Rodada (1, 2, ...) em que o jogador zerou. */
  eliminatedInRound?: number;
  joinedInRound: number;
}

export interface MatchState {
  standings: Standing[];
  roundsPlayed: number;
  activeIds: string[];
  /** Quem dá as cartas na próxima rodada (vazio quando a partida terminou). */
  dealerId?: string;
  /** Quem deu as cartas em cada rodada já jogada. */
  dealers: string[];
  /** Quem é mão (primeiro a receber, à direita de quem dá) na próxima rodada. */
  handId?: string;
  /** Quem foi mão em cada rodada já jogada. */
  hands: string[];
  winnerId?: string;
  finished: boolean;
}
