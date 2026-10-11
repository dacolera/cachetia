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

/**
 * Rodada em execução: a preparação terminou e quem fugiu (`fled`) já perde o ponto aqui.
 * Os demais ativos estão jogando e aguardam o fim da rodada.
 */
export interface StartEvent {
  type: 'start';
  id: string;
  at: string;
  fled: string[];
}

/**
 * Fim de rodada: um vencedor, os listados em `fled` fugiram e o resto da mesa jogou e perdeu.
 * Quando vem depois de um `start`, repete a lista de quem fugiu (que já foi descontada no início).
 */
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

/**
 * Rachar o prêmio: com dois na mesa, eles param de jogar e dividem o prêmio (o pote menos as
 * devoluções do livrar). A partida termina aqui, com os dois como vencedores.
 */
export interface SplitEvent {
  type: 'split';
  id: string;
  at: string;
  shares: PrizeShare[];
}

export interface PrizeShare {
  playerId: string;
  cents: number;
}

export type MatchEvent = JoinEvent | StartEvent | RoundEvent | PactEvent | SplitEvent;

/**
 * A partida guarda só a sequência de eventos; placar, eliminações e vencedor
 * são sempre derivados dela. Isso deixa o desfazer trivial e facilita a
 * sincronização numa futura versão online.
 */
export interface Match {
  id: string;
  createdAt: string;
  /** Evento em que a partida foi jogada. Partidas de antes dos eventos pertencem ao primeiro. */
  eventId?: string;
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

/**
 * Evento: um encontro de jogo com caixa próprio. Nasce zerado e, ao ser encerrado, o crédito
 * que sobrou é pago em dinheiro a cada um, zerando o caixa. Pode durar dias, e um dia pode ter vários.
 */
export interface GameEvent {
  id: string;
  name: string;
  startedAt: string;
  endedAt?: string;
}

export type RoundOutcome = 'won' | 'lost' | 'fled';

export interface Standing {
  playerId: string;
  points: number;
  /** Rodada (1, 2, ...) em que o jogador zerou. */
  eliminatedInRound?: number;
  joinedInRound: number;
  /** Placar do jogador nesta partida: rodadas que venceu, de que correu e que jogou e perdeu. */
  wins: number;
  fled: number;
  lost: number;
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
  /** Prêmio rachado: quanto cada um dos dois leva (a partida terminou sem vencedor único). */
  split?: PrizeShare[];
  /**
   * Rodada em execução: quem fugiu (já descontado) e quem está jogando. `handId` é quem joga
   * como mão: o mão da rodada ou, se ele correu, o próximo que ficou no jogo (o rodízio não muda).
   */
  current?: { fled: string[]; playingIds: string[]; handId?: string };
}
